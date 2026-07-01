"""Read-only analytical queries over the DuckDB store."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import duckdb

from ppi.core.contracts import AnalysisScope, ProjectRef
from ppi.query import metric_catalog
from ppi.storage import schema

_AGG_SUFFIXES = frozenset({"mean", "median", "p95", "max"})


class QueryNotFoundError(LookupError):
    """Raised when a commit, module, file, or edge selector is unknown."""


def edge_included(score: int, *, include_zero_score: bool) -> bool:
    """Return whether an edge is visible under the FR-027 inclusion rule."""
    return include_zero_score or score >= 1


def _value_column(metric: str, agg: str) -> str:
    """Return a whitelisted JSON key for a metric value."""
    if agg not in _AGG_SUFFIXES:
        raise ValueError(f"Unsupported aggregation: {agg}")
    if metric.endswith(f"_{agg}"):
        return metric
    if metric in ("python_file_count",):
        return metric
    return f"{metric}_{agg}"


def _hotspot_target(level: str) -> tuple[str, str]:
    """Return a whitelisted table and SQL name expression for hotspot queries."""
    if level == "module":
        return "module_aggregate", "t.module_name"
    if level == "file":
        return "file_metric", "t.module_name || '/' || t.relative_path"
    raise ValueError(f"Unsupported hotspot level: {level}")


def _hotspot_column(metric: str, agg: str, *, level: str) -> str:
    """Return a whitelisted hotspot value SQL expression from JSON column."""
    if metric == "python_file_count":
        if level != "module":
            raise ValueError(
                "python_file_count hotspots are module-level only",
            )
        return (
            "CAST(t.metrics->>'$.python_file_count' AS DOUBLE)"
        )
    if agg not in _AGG_SUFFIXES:
        raise ValueError(f"Unsupported aggregation: {agg}")
    key = metric if metric.endswith(f"_{agg}") else f"{metric}_{agg}"
    return f"CAST(t.metrics->>'$.{key}' AS DOUBLE)"


class StoreReader:
    """Read analysis history from one DuckDB store."""

    def __init__(
        self,
        store_file: Path,
        read_only: bool = True,
        *,
        migrate: bool = True,
    ) -> None:
        """Open a DuckDB connection."""
        if not store_file.is_file():
            raise FileNotFoundError(
                f"Store not found: {store_file}",
            )

        self._connection = duckdb.connect(
            str(store_file),
            read_only=read_only,
        )
        schema.assert_schema_compatible(self._connection)

    def close(self) -> None:
        """Close the DuckDB connection."""
        self._connection.close()

    def get_project(self) -> ProjectRef | None:
        """Return the stored project row when present."""
        row = self._connection.execute(
            """
            SELECT
                project_id,
                repo_path,
                branch,
                profile,
                project_label,
                module_prefixes,
                include_modules,
                all_modules
            FROM project
            LIMIT 1
            """,
        ).fetchone()

        if not row:
            return None

        return ProjectRef(
            project_id=row[0],
            repo_path=row[1],
            branch=row[2],
            profile=row[3],
            scope=AnalysisScope(
                project_label=(
                    row[4] or ""
                ),
                module_prefixes=tuple(
                    p
                    for p in (row[5] or "").split(",")
                    if p
                ),
                include_modules=tuple(
                    p
                    for p in (row[6] or "").split(",")
                    if p
                ),
                all_modules=bool(row[7]),
            ),
        )

    def commit_count(self) -> int:
        """Return number of stored commits."""
        row = self._connection.execute(
            "SELECT COUNT(*) FROM commit",
        ).fetchone()
        return int(row[0]) if row else 0

    def list_module_names(self) -> list[str]:
        """Return distinct module names present in the store."""
        rows = self._connection.execute(
            """
            SELECT DISTINCT module_name
            FROM module_aggregate
            ORDER BY module_name
            """,
        ).fetchall()
        return [row[0] for row in rows]

    def module_exists(self, module_name: str) -> bool:
        """Return whether module aggregate rows exist for a module name."""
        row = self._connection.execute(
            """
            SELECT 1
            FROM module_aggregate
            WHERE module_name = ?
            LIMIT 1
            """,
            [module_name],
        ).fetchone()
        return row is not None

    def file_exists(
        self,
        module_name: str,
        relative_path: str,
    ) -> bool:
        """Return whether file metric rows exist for one file."""
        row = self._connection.execute(
            """
            SELECT 1
            FROM file_metric
            WHERE module_name = ?
              AND relative_path = ?
            LIMIT 1
            """,
            [module_name, relative_path],
        ).fetchone()
        return row is not None

    def module_exists_at_commit(
        self,
        module_name: str,
        commit_hash: str,
    ) -> bool:
        """Return whether module aggregate rows exist at one commit."""
        row = self._connection.execute(
            """
            SELECT 1
            FROM module_aggregate
            WHERE commit_hash = ?
              AND module_name = ?
            LIMIT 1
            """,
            [commit_hash, module_name],
        ).fetchone()
        return row is not None

    def file_exists_at_commit(
        self,
        module_name: str,
        relative_path: str,
        commit_hash: str,
    ) -> bool:
        """Return whether file metric rows exist at one commit."""
        row = self._connection.execute(
            """
            SELECT 1
            FROM file_metric
            WHERE commit_hash = ?
              AND module_name = ?
              AND relative_path = ?
            LIMIT 1
            """,
            [commit_hash, module_name, relative_path],
        ).fetchone()
        return row is not None

    def schema_version(self) -> int:
        """Return the stored schema version."""
        version = schema.read_schema_version(
            self._connection,
        )
        return (
            version
            if version is not None
            else schema.SCHEMA_VERSION
        )

    def _resolve_commit(
        self,
        commit_hash: str | None,
    ) -> str:
        """Resolve a commit hash, defaulting to the latest stored commit."""
        if commit_hash is None:
            resolved = self.latest_commit_hash()
            if resolved is None:
                raise QueryNotFoundError(
                    "No commits in store",
                )
            return resolved

        if not self.commit_exists(commit_hash):
            raise QueryNotFoundError(
                f"Unknown commit: {commit_hash}",
            )

        return commit_hash

    def module_complexity_timeseries(
        self,
        module_name: str,
        metric: str = "cyclomatic",
        agg: str = "mean",
    ) -> list[dict[str, Any]]:
        """Return complexity-over-time rows for one module."""
        value_key = _value_column(metric, agg)

        rows = self._connection.execute(
            f"""
            SELECT
                c.commit_order,
                c.commit_hash,
                CAST(
                    m.metrics->>'$.{value_key}'
                    AS DOUBLE
                ) AS value
            FROM module_aggregate m
            JOIN commit c
                ON c.commit_hash = m.commit_hash
            WHERE m.module_name = ?
            ORDER BY c.commit_order
            """,
            [module_name],
        ).fetchall()

        return [
            {
                "commit_order": row[0],
                "commit_hash": row[1],
                "value": row[2],
            }
            for row in rows
        ]

    def module_lines_timeseries(
        self,
        module_name: str,
    ) -> list[dict[str, Any]]:
        """Return total line count over time for one module."""
        rows = self._connection.execute(
            """
            SELECT
                c.commit_order,
                c.commit_hash,
                m.total_lines AS value
            FROM module_aggregate m
            JOIN commit c
                ON c.commit_hash = m.commit_hash
            WHERE m.module_name = ?
            ORDER BY c.commit_order
            """,
            [module_name],
        ).fetchall()

        return [
            {
                "commit_order": row[0],
                "commit_hash": row[1],
                "value": row[2],
            }
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
        value_key = _value_column(metric, agg)

        rows = self._connection.execute(
            f"""
            SELECT
                c.commit_order,
                c.commit_hash,
                CAST(
                    f.metrics->>'$.{value_key}'
                    AS DOUBLE
                ) AS value
            FROM file_metric f
            JOIN commit c
                ON c.commit_hash = f.commit_hash
            WHERE f.module_name = ?
              AND f.relative_path = ?
            ORDER BY c.commit_order
            """,
            [module_name, relative_path],
        ).fetchall()

        return [
            {
                "commit_order": row[0],
                "commit_hash": row[1],
                "value": row[2],
            }
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
            SELECT
                c.commit_order,
                c.commit_hash,
                CAST(
                    f.line_counts->>'$.lines'
                    AS INT
                ) AS value
            FROM file_metric f
            JOIN commit c
                ON c.commit_hash = f.commit_hash
            WHERE f.module_name = ?
              AND f.relative_path = ?
            ORDER BY c.commit_order
            """,
            [module_name, relative_path],
        ).fetchall()

        return [
            {
                "commit_order": row[0],
                "commit_hash": row[1],
                "value": row[2],
            }
            for row in rows
        ]

    def snapshot_table_modules(
        self,
        commit_hash: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return module aggregate rows at one commit with parsed JSON columns."""
        resolved = self._resolve_commit(commit_hash)

        rows = self._connection.execute(
            """
            SELECT
                module_name,
                total_lines,
                metrics,
                line_counts,
                distributions
            FROM module_aggregate
            WHERE commit_hash = ?
            ORDER BY module_name
            """,
            [resolved],
        ).fetchall()

        return [
            {
                "module_name": row[0],
                "total_lines": row[1],
                "metrics": json.loads(row[2]),
                "line_counts": json.loads(row[3]),
                "distributions": json.loads(row[4]),
            }
            for row in rows
        ]

    def snapshot_table_files(
        self,
        commit_hash: str | None = None,
        module_name: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return file metric rows at one commit with parsed JSON columns."""
        resolved = self._resolve_commit(commit_hash)

        params: list[Any] = [resolved]
        module_filter = ""

        if module_name is not None:
            if not self.module_exists_at_commit(
                module_name,
                resolved,
            ):
                raise QueryNotFoundError(
                    f"Unknown module: {module_name}",
                )
            module_filter = " AND module_name = ?"
            params.append(module_name)

        rows = self._connection.execute(
            f"""
            SELECT
                module_name,
                relative_path,
                line_category_id,
                metrics,
                line_counts,
                distributions
            FROM file_metric
            WHERE commit_hash = ?{module_filter}
            ORDER BY module_name, relative_path
            """,
            params,
        ).fetchall()

        return [
            {
                "module_name": row[0],
                "relative_path": row[1],
                "line_category_id": row[2],
                "metrics": json.loads(row[3]),
                "line_counts": json.loads(row[4]),
                "distributions": json.loads(row[5]),
            }
            for row in rows
        ]

    def project_info(self) -> dict[str, Any]:
        """Return project metadata and commit count."""
        project = self.get_project()
        return {
            "project_id": project.project_id if project else None,
            "branch": project.branch if project else None,
            "commit_count": self.commit_count(),
        }

    def graph_at_commit(
        self,
        commit_hash: str | None = None,
        *,
        include_zero_score: bool = False,
    ) -> dict[str, Any]:
        """Return graph nodes and edges at one commit."""
        resolved = self._resolve_commit(commit_hash)

        rows = self._connection.execute(
            """
            SELECT
                module_name,
                total_lines,
                metrics,
                line_counts
            FROM module_aggregate
            WHERE commit_hash = ?
            ORDER BY module_name
            """,
            [resolved],
        ).fetchall()

        nodes = []
        for row in rows:
            parsed_metrics = json.loads(row[2])
            parsed_line_counts = json.loads(row[3])

            nodes.append(
                {
                    "module_name": row[0],
                    "total_lines": row[1],
                    "metrics": parsed_metrics,
                    "line_counts": parsed_line_counts,

                },
            )

        edges = self.edges_at_commit(
            resolved,
            include_zero_score=include_zero_score,
        )

        return {
            "commit_hash": resolved,
            "nodes": nodes,
            "edges": edges,
        }

    def commit_exists(
        self,
        commit_hash: str,
    ) -> bool:
        """Return whether a commit hash is stored."""
        row = self._connection.execute(
            """
            SELECT 1
            FROM commit
            WHERE commit_hash = ?
            LIMIT 1
            """,
            [commit_hash],
        ).fetchone()
        return row is not None

    def latest_edge_commit_hash(self) -> str | None:
        """Return the newest commit hash with persisted coupling edges."""
        row = self._connection.execute(
            """
            SELECT c.commit_hash
            FROM commit c
            WHERE EXISTS (
                SELECT 1
                FROM coupling_edge e
                WHERE e.commit_hash = c.commit_hash
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
                SELECT 1
                FROM module_aggregate m
                WHERE m.commit_hash = c.commit_hash
            )
            OR EXISTS (
                SELECT 1
                FROM file_metric f
                WHERE f.commit_hash = c.commit_hash
            )
            ORDER BY c.commit_order DESC
            LIMIT 1
            """,
        ).fetchone()
        return row[0] if row else None

    def edges_at_commit(
        self,
        commit_hash: str | None = None,
        *,
        include_zero_score: bool = False,
    ) -> list[dict[str, Any]]:
        """Return coupling edges for one commit, defaulting to latest."""
        if commit_hash is None:
            commit_hash = (
                self.latest_edge_commit_hash()
                or self.latest_commit_hash()
            )
            if commit_hash is None:
                return []

        rows = self._connection.execute(
            """
            SELECT
                source_module,
                target_module,
                score,
                kinds,
                kind_occurrence_count,
                breakdown
            FROM coupling_edge
            WHERE commit_hash = ?
            ORDER BY score DESC
            """,
            [commit_hash],
        ).fetchall()

        return [
            {
                "source": row[0],
                "target": row[1],
                "score": row[2],
                "kinds": json.loads(row[3]),
                "kind_occurrence_count": row[4],
                "breakdown": (
                    json.loads(row[5])
                    if row[5] is not None
                    else None
                ),
                "commit_hash": commit_hash,
            }
            for row in rows
            if edge_included(
                int(row[2]),
                include_zero_score=include_zero_score,
            )
        ]

    def snapshot_relations(
        self,
        commit_hash: str | None = None,
        include_zero_score: bool = False,
    ) -> list[dict[str, Any]]:
        """Return relation rows expanded from coupling edges and manifest deps at one commit."""
        resolved = self._resolve_commit(commit_hash)

        coupling_rows = self._connection.execute(
            """
            SELECT
                source_module,
                target_module,
                score,
                kinds,
                breakdown
            FROM coupling_edge
            WHERE commit_hash = ?
            """,
            [resolved],
        ).fetchall()

        manifest_rows = self._connection.execute(
            """
            SELECT module_name, manifest_depends
            FROM module_aggregate
            WHERE commit_hash = ? AND manifest_depends != ''
            """,
            [resolved],
        ).fetchall()

        relations: list[dict[str, Any]] = []
        for row in coupling_rows:
            source = row[0]
            target = row[1]
            score = int(row[2])
            kinds = json.loads(row[3]) if row[3] is not None else {}
            if not include_zero_score and score == 0:
                continue
            for kind_key, count in kinds.items():
                if count <= 0:
                    continue
                relations.append(
                    {
                        "source_id": source,
                        "source_label": source,
                        "target_id": target,
                        "target_label": target,
                        "relation_type_id": kind_key,
                        "relation_type_label": metric_catalog.relation_type_label(kind_key),
                        "strength_metric_id": "score",
                        "strength_metric_label": metric_catalog.strength_metric_label("score"),
                        "strength_value": float(score),
                    }
                )
        for row in manifest_rows:
            source = row[0]
            raw = row[1]
            if raw:
                try:
                    deps = json.loads(raw)
                except (ValueError, json.JSONDecodeError):
                    deps = [d for d in raw.split(",") if d]
            else:
                deps = []
            for target in deps:
                relations.append(
                    {
                        "source_id": source,
                        "source_label": source,
                        "target_id": target,
                        "target_label": target,
                        "relation_type_id": "manifest_depends",
                        "relation_type_label": metric_catalog.relation_type_label("manifest_depends"),
                        "strength_metric_id": "",
                        "strength_metric_label": "",
                        "strength_value": 0.0,
                    }
                )
        return relations

    def commits(self) -> list[dict[str, Any]]:
        """Return ordered commit timeline."""
        rows = self._connection.execute(
            """
            SELECT
                commit_hash,
                commit_order,
                authored_at,
                summary
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

    def hotspots(
        self,
        *,
        level: str = "module",
        metric: str = "cyclomatic",
        by: str = "value",
        limit: int = 20,
        agg: str = "mean",
    ) -> list[dict[str, Any]]:
        """Return top-N hotspots by current value or growth."""
        if by not in {"value", "growth"}:
            raise ValueError(
                f"Unsupported hotspot mode: {by}",
            )

        table, name_column = _hotspot_target(level)
        column = _hotspot_column(metric, agg, level=level)

        if by == "growth":
            rows = self._connection.execute(
                f"""
                WITH ranked AS (
                    SELECT
                        {name_column} AS name,
                        {column} AS current,
                        FIRST({column}) OVER (
                            PARTITION BY {name_column}
                            ORDER BY c.commit_order
                        ) AS first_value,
                        c.commit_order
                    FROM {table} t
                    JOIN commit c
                        ON c.commit_hash = t.commit_hash
                ),
                latest AS (
                    SELECT
                        name,
                        current,
                        first_value,
                        current - first_value AS growth,
                        ROW_NUMBER() OVER (
                            PARTITION BY name
                            ORDER BY commit_order DESC
                        ) AS rn
                    FROM ranked
                )
                SELECT
                    name,
                    current,
                    first_value,
                    growth
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
                SELECT
                    {name_column} AS name,
                    {column} AS current,
                    c.commit_order,
                    ROW_NUMBER() OVER (
                        PARTITION BY {name_column}
                        ORDER BY c.commit_order DESC
                    ) AS rn
                FROM {table} t
                JOIN commit c
                    ON c.commit_hash = t.commit_hash
            )
            SELECT
                name,
                current
            FROM latest
            WHERE rn = 1
            ORDER BY current DESC
            LIMIT ?
            """,
            [limit],
        ).fetchall()

        return [
            {
                "name": row[0],
                "current": row[1],
                "growth": None,
            }
            for row in rows
        ]
