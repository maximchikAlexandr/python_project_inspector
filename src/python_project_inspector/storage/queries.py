"""Read-only analytical queries over the DuckDB store."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

import duckdb

from python_project_inspector.core.contracts import ProjectRef
from python_project_inspector.storage import schema

_METRIC_PREFIXES = {"cyclomatic": "cc", "cognitive": "cog", "jones": "jones"}
_AGG_SUFFIXES = frozenset({"mean", "median", "p95", "max"})


def _metric_prefix(metric: str) -> str:
    """Return a whitelisted metric column prefix."""
    try:
        return _METRIC_PREFIXES[metric]
    except KeyError as exc:
        raise ValueError(f"Unsupported metric: {metric}") from exc


def _value_column(metric: str, agg: str) -> str:
    """Return a whitelisted aggregate column name."""
    if agg not in _AGG_SUFFIXES:
        raise ValueError(f"Unsupported aggregation: {agg}")
    return f"{_metric_prefix(metric)}_{agg}"


def _hotspot_target(level: str) -> tuple[str, str]:
    """Return a whitelisted table and SQL name expression for hotspot queries."""
    if level == "module":
        return "module_aggregate", "t.module_name"
    if level == "file":
        return "file_metric", "t.module_name || '/' || t.relative_path"
    raise ValueError(f"Unsupported hotspot level: {level}")


class StoreReader:
    """Read analysis history from one DuckDB store."""

    def __init__(self, store_file: Path, read_only: bool = True) -> None:
        """Open a DuckDB connection."""
        if not store_file.is_file():
            raise FileNotFoundError(f"Store not found: {store_file}")
        self._connection = duckdb.connect(str(store_file), read_only=read_only)
        schema.assert_schema_compatible(self._connection)

    def close(self) -> None:
        """Close the DuckDB connection."""
        self._connection.close()

    def get_project(self) -> ProjectRef | None:
        """Return the stored project row when present."""
        row = self._connection.execute(
            "SELECT project_id, repo_path, branch, profile FROM project LIMIT 1",
        ).fetchone()
        if not row:
            return None
        return ProjectRef(project_id=row[0], repo_path=row[1], branch=row[2], profile=row[3])

    def commit_count(self) -> int:
        """Return number of stored commits."""
        row = self._connection.execute("SELECT COUNT(*) FROM commit").fetchone()
        return int(row[0]) if row else 0

    def module_complexity_timeseries(
        self,
        module_name: str,
        metric: str = "cyclomatic",
        agg: str = "mean",
    ) -> list[dict[str, Any]]:
        """Return complexity-over-time rows for one module."""
        value_column = _value_column(metric, agg)
        rows = self._connection.execute(
            f"""
            SELECT c.commit_order, c.commit_hash, m.{value_column} AS value
            FROM module_aggregate m
            JOIN commit c ON c.commit_hash = m.commit_hash
            WHERE m.module_name = ?
            ORDER BY c.commit_order
            """,
            [module_name],
        ).fetchall()
        return [
            {"commit_order": row[0], "commit_hash": row[1], "value": row[2]}
            for row in rows
        ]

    def module_lines_timeseries(self, module_name: str) -> list[dict[str, Any]]:
        """Return total line count over time for one module."""
        rows = self._connection.execute(
            """
            SELECT c.commit_order, c.commit_hash, m.total_lines AS value
            FROM module_aggregate m
            JOIN commit c ON c.commit_hash = m.commit_hash
            WHERE m.module_name = ?
            ORDER BY c.commit_order
            """,
            [module_name],
        ).fetchall()
        return [
            {"commit_order": row[0], "commit_hash": row[1], "value": row[2]}
            for row in rows
        ]

    def file_complexity_timeseries(
        self,
        module_name: str,
        relative_path: str,
        metric: str = "cyclomatic",
        agg: str = "mean",
    ) -> list[dict[str, Any]]:
        """Return complexity-over-time rows for one file."""
        value_column = _value_column(metric, agg)
        rows = self._connection.execute(
            f"""
            SELECT c.commit_order, c.commit_hash, f.{value_column} AS value
            FROM file_metric f
            JOIN commit c ON c.commit_hash = f.commit_hash
            WHERE f.module_name = ? AND f.relative_path = ?
            ORDER BY c.commit_order
            """,
            [module_name, relative_path],
        ).fetchall()
        return [
            {"commit_order": row[0], "commit_hash": row[1], "value": row[2]}
            for row in rows
        ]

    def file_lines_timeseries(
        self,
        module_name: str,
        relative_path: str,
    ) -> list[dict[str, Any]]:
        """Return line count over time for one file."""
        rows = self._connection.execute(
            """
            SELECT c.commit_order, c.commit_hash, f.lines AS value
            FROM file_metric f
            JOIN commit c ON c.commit_hash = f.commit_hash
            WHERE f.module_name = ? AND f.relative_path = ?
            ORDER BY c.commit_order
            """,
            [module_name, relative_path],
        ).fetchall()
        return [
            {"commit_order": row[0], "commit_hash": row[1], "value": row[2]}
            for row in rows
        ]

    def list_module_names(self) -> list[str]:
        """Return distinct module names present in the store."""
        rows = self._connection.execute(
            "SELECT DISTINCT module_name FROM module_aggregate ORDER BY module_name",
        ).fetchall()
        return [row[0] for row in rows]

    def list_file_names(self, limit: int = 5000) -> list[str]:
        """Return distinct file paths as module/relative_path."""
        rows = self._connection.execute(
            """
            SELECT DISTINCT module_name || '/' || relative_path AS name
            FROM file_metric
            ORDER BY name
            LIMIT ?
            """,
            [limit],
        ).fetchall()
        return [row[0] for row in rows]

    def module_exists(self, module_name: str) -> bool:
        """Return whether module aggregate rows exist for a module name."""
        row = self._connection.execute(
            "SELECT 1 FROM module_aggregate WHERE module_name = ? LIMIT 1",
            [module_name],
        ).fetchone()
        return row is not None

    def file_exists(self, module_name: str, relative_path: str) -> bool:
        """Return whether file metric rows exist for one file."""
        row = self._connection.execute(
            """
            SELECT 1 FROM file_metric
            WHERE module_name = ? AND relative_path = ?
            LIMIT 1
            """,
            [module_name, relative_path],
        ).fetchone()
        return row is not None

    def schema_version(self) -> int:
        """Return the stored schema version."""
        version = schema.read_schema_version(self._connection)
        return version if version is not None else schema.SCHEMA_VERSION

    def hotspots(
        self,
        *,
        level: str = "module",
        metric: str = "cyclomatic",
        by: str = "value",
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Return top-N hotspots by current value or growth."""
        if by not in {"value", "growth"}:
            raise ValueError(f"Unsupported hotspot mode: {by}")
        table, name_column = _hotspot_target(level)
        column = _metric_prefix(metric)
        if by == "growth":
            rows = self._connection.execute(
                f"""
                WITH ranked AS (
                    SELECT {name_column} AS name,
                           {column}_mean AS current,
                           FIRST({column}_mean) OVER (
                               PARTITION BY {name_column} ORDER BY c.commit_order
                           ) AS first_value,
                           c.commit_order
                    FROM {table} t
                    JOIN commit c ON c.commit_hash = t.commit_hash
                ),
                latest AS (
                    SELECT name, current, first_value,
                           current - first_value AS growth,
                           ROW_NUMBER() OVER (PARTITION BY name ORDER BY commit_order DESC) AS rn
                    FROM ranked
                )
                SELECT name, current, first_value, growth
                FROM latest
                WHERE rn = 1
                ORDER BY growth DESC
                LIMIT ?
                """,
                [limit],
            ).fetchall()
            return [
                {
                    "name": row[0],
                    "current": row[1],
                    "first": row[2],
                    "growth": row[3],
                }
                for row in rows
            ]
        rows = self._connection.execute(
            f"""
            WITH latest AS (
                SELECT {name_column} AS name, {column}_mean AS current, c.commit_order,
                       ROW_NUMBER() OVER (
                           PARTITION BY {name_column} ORDER BY c.commit_order DESC
                       ) AS rn
                FROM {table} t
                JOIN commit c ON c.commit_hash = t.commit_hash
            )
            SELECT name, current
            FROM latest
            WHERE rn = 1
            ORDER BY current DESC
            LIMIT ?
            """,
            [limit],
        ).fetchall()
        return [{"name": row[0], "current": row[1], "growth": None} for row in rows]

    def commit_exists(self, commit_hash: str) -> bool:
        """Return whether a commit hash is stored."""
        row = self._connection.execute(
            "SELECT 1 FROM commit WHERE commit_hash = ? LIMIT 1",
            [commit_hash],
        ).fetchone()
        return row is not None

    def coupling_structure_timeseries(self) -> list[dict[str, Any]]:
        """Return coupling edge count and total score over commit history."""
        rows = self._connection.execute(
            """
            SELECT c.commit_order,
                   c.commit_hash,
                   COUNT(e.source_module) AS edge_count,
                   COALESCE(SUM(e.score), 0) AS total_score
            FROM commit c
            LEFT JOIN coupling_edge e ON e.commit_hash = c.commit_hash
            GROUP BY c.commit_order, c.commit_hash
            ORDER BY c.commit_order
            """,
        ).fetchall()
        return [
            {
                "commit_order": row[0],
                "commit_hash": row[1],
                "edge_count": int(row[2]),
                "total_score": int(row[3]),
            }
            for row in rows
        ]

    def latest_edge_commit_hash(self) -> str | None:
        """Return the newest commit hash with persisted coupling edges."""
        row = self._connection.execute(
            """
            SELECT c.commit_hash
            FROM commit c
            WHERE EXISTS (
                SELECT 1 FROM coupling_edge e WHERE e.commit_hash = c.commit_hash
            )
            ORDER BY c.commit_order DESC
            LIMIT 1
            """,
        ).fetchone()
        return row[0] if row else None

    def latest_commit_hash(self) -> str | None:
        """Return the newest commit hash with persisted metric rows."""
        row = self._connection.execute(
            """
            SELECT c.commit_hash
            FROM commit c
            WHERE EXISTS (
                SELECT 1 FROM module_aggregate m WHERE m.commit_hash = c.commit_hash
            ) OR EXISTS (
                SELECT 1 FROM file_metric f WHERE f.commit_hash = c.commit_hash
            )
            ORDER BY c.commit_order DESC
            LIMIT 1
            """,
        ).fetchone()
        return row[0] if row else None

    def edges_at_commit(self, commit_hash: str | None = None) -> list[dict[str, Any]]:
        """Return coupling edges for one commit, defaulting to latest."""
        if commit_hash is None:
            commit_hash = self.latest_edge_commit_hash() or self.latest_commit_hash()
            if commit_hash is None:
                return []
        rows = self._connection.execute(
            """
            SELECT source_module, target_module, score
            FROM coupling_edge
            WHERE commit_hash = ?
            ORDER BY score DESC
            """,
            [commit_hash],
        ).fetchall()
        kind_rows = self._connection.execute(
            """
            SELECT source_module, target_module, kind, count
            FROM coupling_edge_kind
            WHERE commit_hash = ?
            """,
            [commit_hash],
        ).fetchall()
        kinds_by_edge: dict[tuple[str, str], dict[str, int]] = defaultdict(dict)
        for source, target, kind, count in kind_rows:
            kinds_by_edge[(source, target)][kind] = count
        return [
            {
                "source": row[0],
                "target": row[1],
                "score": row[2],
                "kinds": kinds_by_edge.get((row[0], row[1]), {}),
                "commit_hash": commit_hash,
            }
            for row in rows
        ]

    def commits(self) -> list[dict[str, Any]]:
        """Return ordered commit timeline."""
        rows = self._connection.execute(
            """
            SELECT commit_hash, commit_order, authored_at, summary
            FROM commit
            ORDER BY commit_order
            """,
        ).fetchall()
        return [
            {
                "commit_hash": row[0],
                "commit_order": row[1],
                "authored_at": row[2],
                "summary": row[3],
            }
            for row in rows
        ]

    def last_run(self) -> dict[str, Any] | None:
        """Return the most recent analysis run row."""
        row = self._connection.execute(
            """
            SELECT run_id, branch, mode, status, started_at, finished_at,
                   commits_total, commits_succeeded, commits_failed
            FROM analysis_run
            ORDER BY started_at DESC
            LIMIT 1
            """,
        ).fetchone()
        if not row:
            return None
        return {
            "run_id": row[0],
            "branch": row[1],
            "mode": row[2],
            "status": row[3],
            "started_at": row[4],
            "finished_at": row[5],
            "commits_total": row[6],
            "commits_succeeded": row[7],
            "commits_failed": row[8],
        }
