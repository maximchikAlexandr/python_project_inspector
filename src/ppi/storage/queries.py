"""Read-only analytical queries over the DuckDB store."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

import duckdb

from ppi.core.contracts import AnalysisScope, ProjectRef
from ppi.core.odoo.kinds import KIND_TO_CATEGORY
from ppi.storage import schema

_METRIC_PREFIXES = {"cyclomatic": "cc", "cognitive": "cog", "jones": "jones"}
_AGG_SUFFIXES = frozenset({"mean", "median", "p95", "max"})
_LINE_CATEGORY_COLUMNS = (
    "python_lines",
    "js_lines",
    "python_test_lines",
    "xml_lines",
    "css_lines",
    "html_lines",
)


class QueryNotFoundError(LookupError):
    """Raised when a commit, module, file, or edge selector is unknown."""


def edge_included(score: int, *, include_zero_score: bool) -> bool:
    """Return whether an edge is visible under the FR-027 inclusion rule."""
    return include_zero_score or score >= 1


def _metric_distribution(row: dict[str, Any], prefix: str) -> dict[str, float | int]:
    """Build a complexity distribution dict from a flat row."""
    return {
        "count": row[f"{prefix}_count"],
        "mean": row[f"{prefix}_mean"],
        "median": row[f"{prefix}_median"],
        "p95": row[f"{prefix}_p95"],
        "max": row[f"{prefix}_max"],
    }


def _line_categories(row: dict[str, Any]) -> dict[str, int]:
    """Build line category counts from a module aggregate row."""
    return {column: int(row[column]) for column in _LINE_CATEGORY_COLUMNS}


def _category_why_points(kind_rows: list[tuple[str, int]]) -> dict[str, str]:
    """Build per-category kind/count explanations for one edge."""
    parts_by_category: dict[str, list[str]] = defaultdict(list)
    for kind, count in kind_rows:
        if not count:
            continue
        category = KIND_TO_CATEGORY.get(kind)
        if category is None:
            continue
        parts_by_category[category].append(f"{kind}={count}")
    return {category: ", ".join(parts) for category, parts in sorted(parts_by_category.items())}


def _breakdown_dict(row: tuple[Any, ...]) -> dict[str, int]:
    """Build an edge breakdown dict from a breakdown table row."""
    return {
        "model_reuse": int(row[0]),
        "extension_or_method": int(row[1]),
        "view": int(row[2]),
        "field_property": int(row[3]),
        "total": int(row[4]),
    }


_EDGE_POINT_CATEGORIES = (
    "model_reuse",
    "extension_or_method",
    "view",
    "field_property",
)


def _pair_filter_sql(pairs: list[tuple[str, str]]) -> tuple[str, list[Any]]:
    """Build an OR filter for many source/target module pairs."""
    if not pairs:
        return "FALSE", []
    clause = " OR ".join(["(source_module = ? AND target_module = ?)"] * len(pairs))
    params = [value for pair in pairs for value in pair]
    return clause, params


def _edge_points_payload(
    resolved: str,
    source: str,
    target: str,
    score: int,
    breakdown_row: tuple[Any, ...] | None,
    kind_rows: list[tuple[str, int]],
    evidence: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build one edge-points response dict."""
    breakdown = _breakdown_dict(breakdown_row) if breakdown_row else {
        "model_reuse": 0,
        "extension_or_method": 0,
        "view": 0,
        "field_property": 0,
        "total": score,
    }
    why_points = _category_why_points(kind_rows)
    return {
        "commit_hash": resolved,
        "source": source,
        "target": target,
        "breakdown": breakdown,
        "points": [
            {
                "category": category,
                "points": breakdown[category],
                "why_points": why_points.get(category, ""),
            }
            for category in _EDGE_POINT_CATEGORIES
        ],
        "why_points": why_points,
        "evidence": evidence,
    }


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
            """
            SELECT project_id, repo_path, branch, profile,
                   project_label, module_prefixes, include_modules, all_modules
            FROM project LIMIT 1
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
                project_label=row[4] or "",
                module_prefixes=tuple(p for p in (row[5] or "").split(",") if p),
                include_modules=tuple(p for p in (row[6] or "").split(",") if p),
                all_modules=bool(row[7]),
            ),
        )

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

    def module_exists_at_commit(self, module_name: str, commit_hash: str) -> bool:
        """Return whether module aggregate rows exist at one commit."""
        row = self._connection.execute(
            """
            SELECT 1 FROM module_aggregate
            WHERE commit_hash = ? AND module_name = ?
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
            SELECT 1 FROM file_metric
            WHERE commit_hash = ? AND module_name = ? AND relative_path = ?
            LIMIT 1
            """,
            [commit_hash, module_name, relative_path],
        ).fetchone()
        return row is not None

    def schema_version(self) -> int:
        """Return the stored schema version."""
        version = schema.read_schema_version(self._connection)
        return version if version is not None else schema.SCHEMA_VERSION

    def _resolve_commit(self, commit_hash: str | None) -> str:
        """Resolve a commit hash, defaulting to the latest stored commit."""
        if commit_hash is None:
            resolved = self.latest_commit_hash()
            if resolved is None:
                raise QueryNotFoundError("No commits in store")
            return resolved
        if not self.commit_exists(commit_hash):
            raise QueryNotFoundError(f"Unknown commit: {commit_hash}")
        return commit_hash

    def _module_models_at_commit(
        self,
        commit_hash: str,
        module_name: str | None = None,
    ) -> dict[str, dict[str, list[str]]]:
        """Return declared and inherited model lists keyed by module name."""
        params: list[Any] = [commit_hash]
        module_filter = ""
        if module_name is not None:
            module_filter = " AND module_name = ?"
            params.append(module_name)
        rows = self._connection.execute(
            f"""
            SELECT module_name, model_name, relation
            FROM module_model
            WHERE commit_hash = ?{module_filter}
            ORDER BY module_name, model_name
            """,
            params,
        ).fetchall()
        models_by_module: dict[str, dict[str, list[str]]] = defaultdict(
            lambda: {"declared": [], "inherited": []},
        )
        for mod_name, model_name, relation in rows:
            models_by_module[mod_name][relation].append(model_name)
        return models_by_module

    def _manifest_depends_at_commit(
        self,
        commit_hash: str,
        module_name: str | None = None,
    ) -> dict[str, list[str]]:
        """Return manifest depends lists keyed by module name."""
        params: list[Any] = [commit_hash]
        module_filter = ""
        if module_name is not None:
            module_filter = " AND module_name = ?"
            params.append(module_name)
        rows = self._connection.execute(
            f"""
            SELECT module_name, depends_on
            FROM module_manifest_depend
            WHERE commit_hash = ?{module_filter}
            ORDER BY module_name, depends_on
            """,
            params,
        ).fetchall()
        depends_by_module: dict[str, list[str]] = defaultdict(list)
        for mod_name, depends_on in rows:
            depends_by_module[mod_name].append(depends_on)
        return depends_by_module

    def _module_row_dict(self, row: tuple[Any, ...]) -> dict[str, Any]:
        """Convert a module_aggregate row into a snapshot dict."""
        columns = (
            "module_name",
            "total_lines",
            *_LINE_CATEGORY_COLUMNS,
            "python_file_count",
            "cc_count",
            "cc_mean",
            "cc_median",
            "cc_p95",
            "cc_max",
            "cog_count",
            "cog_mean",
            "cog_median",
            "cog_p95",
            "cog_max",
            "jones_count",
            "jones_mean",
            "jones_median",
            "jones_p95",
            "jones_max",
            "python_complexity_parse_errors",
            "score_out",
            "score_in",
        )
        data = dict(zip(columns, row, strict=True))
        flat = {key: data[key] for key in ("module_name", "total_lines", "python_file_count")}
        flat["line_categories"] = _line_categories(data)
        flat["cyclomatic"] = _metric_distribution(data, "cc")
        flat["cognitive"] = _metric_distribution(data, "cog")
        flat["jones"] = _metric_distribution(data, "jones")
        flat["python_complexity_parse_errors"] = data["python_complexity_parse_errors"]
        flat["score_in"] = data["score_in"]
        flat["score_out"] = data["score_out"]
        return flat

    def modules_at_commit(self, commit_hash: str | None = None) -> dict[str, Any]:
        """Return module snapshot rows at one commit."""
        resolved = self._resolve_commit(commit_hash)
        rows = self._connection.execute(
            """
            SELECT module_name, total_lines,
                   python_lines, js_lines, python_test_lines, xml_lines, css_lines, html_lines,
                   python_file_count,
                   cc_count, cc_mean, cc_median, cc_p95, cc_max,
                   cog_count, cog_mean, cog_median, cog_p95, cog_max,
                   jones_count, jones_mean, jones_median, jones_p95, jones_max,
                   python_complexity_parse_errors, score_out, score_in
            FROM module_aggregate
            WHERE commit_hash = ?
            ORDER BY module_name
            """,
            [resolved],
        ).fetchall()
        models_by_module = self._module_models_at_commit(resolved)
        depends_by_module = self._manifest_depends_at_commit(resolved)
        modules = []
        for row in rows:
            module = self._module_row_dict(row)
            model_lists = models_by_module.get(
                module["module_name"], {"declared": [], "inherited": []}
            )
            module["declared_models"] = model_lists["declared"]
            module["inherited_models"] = model_lists["inherited"]
            module["manifest_depends"] = depends_by_module.get(module["module_name"], [])
            modules.append(module)
        return {"commit_hash": resolved, "modules": modules}

    def files_at_commit(
        self,
        commit_hash: str | None = None,
        module_name: str | None = None,
    ) -> dict[str, Any]:
        """Return file snapshot rows at one commit."""
        resolved = self._resolve_commit(commit_hash)
        params: list[Any] = [resolved]
        module_filter = ""
        if module_name is not None:
            if not self.module_exists_at_commit(module_name, resolved):
                raise QueryNotFoundError(f"Unknown module: {module_name}")
            module_filter = " AND module_name = ?"
            params.append(module_name)
        rows = self._connection.execute(
            f"""
            SELECT module_name, relative_path, top_folder, category, lines,
                   function_count, jones_line_count,
                   cc_count, cc_mean, cc_median, cc_p95, cc_max,
                   cog_count, cog_mean, cog_median, cog_p95, cog_max,
                   jones_count, jones_mean, jones_median, jones_p95, jones_max,
                   parse_error
            FROM file_metric
            WHERE commit_hash = ?{module_filter}
            ORDER BY module_name, relative_path
            """,
            params,
        ).fetchall()
        files = [self._file_row_from_tuple(row) for row in rows]
        return {"commit_hash": resolved, "files": files}

    def _file_row_from_tuple(self, row: tuple[Any, ...]) -> dict[str, Any]:
        """Convert one file_metric row into a snapshot dict."""
        data = {
            "module_name": row[0],
            "relative_path": row[1],
            "top_folder": row[2],
            "category": row[3],
            "lines": row[4],
            "function_count": row[5],
            "jones_line_count": row[6],
            "parse_error": row[22],
        }
        metric_row = dict(
            zip(
                (
                    "cc_count",
                    "cc_mean",
                    "cc_median",
                    "cc_p95",
                    "cc_max",
                    "cog_count",
                    "cog_mean",
                    "cog_median",
                    "cog_p95",
                    "cog_max",
                    "jones_count",
                    "jones_mean",
                    "jones_median",
                    "jones_p95",
                    "jones_max",
                ),
                row[7:22],
                strict=True,
            ),
        )
        data["cyclomatic"] = _metric_distribution(metric_row, "cc")
        data["cognitive"] = _metric_distribution(metric_row, "cog")
        data["jones"] = _metric_distribution(metric_row, "jones")
        return data

    def module_detail(self, module_name: str, commit_hash: str | None = None) -> dict[str, Any]:
        """Return one module snapshot including files and manifest depends."""
        resolved = self._resolve_commit(commit_hash)
        row = self._connection.execute(
            """
            SELECT module_name, total_lines,
                   python_lines, js_lines, python_test_lines, xml_lines, css_lines, html_lines,
                   python_file_count,
                   cc_count, cc_mean, cc_median, cc_p95, cc_max,
                   cog_count, cog_mean, cog_median, cog_p95, cog_max,
                   jones_count, jones_mean, jones_median, jones_p95, jones_max,
                   python_complexity_parse_errors, score_out, score_in
            FROM module_aggregate
            WHERE commit_hash = ? AND module_name = ?
            """,
            [resolved, module_name],
        ).fetchone()
        if row is None:
            raise QueryNotFoundError(f"Unknown module: {module_name}")
        module = self._module_row_dict(row)
        model_lists = self._module_models_at_commit(resolved, module_name).get(
            module_name,
            {"declared": [], "inherited": []},
        )
        module["declared_models"] = model_lists["declared"]
        module["inherited_models"] = model_lists["inherited"]
        module["manifest_depends"] = self._manifest_depends_at_commit(resolved, module_name).get(
            module_name,
            [],
        )
        module["files"] = self.files_at_commit(resolved, module_name)["files"]
        return {"commit_hash": resolved, "module": module}

    def file_detail(
        self,
        module_name: str,
        relative_path: str,
        commit_hash: str | None = None,
    ) -> dict[str, Any]:
        """Return one file snapshot at a commit."""
        resolved = self._resolve_commit(commit_hash)
        row = self._connection.execute(
            """
            SELECT module_name, relative_path, top_folder, category, lines,
                   function_count, jones_line_count,
                   cc_count, cc_mean, cc_median, cc_p95, cc_max,
                   cog_count, cog_mean, cog_median, cog_p95, cog_max,
                   jones_count, jones_mean, jones_median, jones_p95, jones_max,
                   parse_error
            FROM file_metric
            WHERE commit_hash = ? AND module_name = ? AND relative_path = ?
            """,
            [resolved, module_name, relative_path],
        ).fetchone()
        if row is None:
            raise QueryNotFoundError(f"Unknown file: {module_name}/{relative_path}")
        return {"commit_hash": resolved, "file": self._file_row_from_tuple(row)}

    def graph_at_commit(
        self,
        commit_hash: str | None = None,
        *,
        include_zero_score: bool = False,
    ) -> dict[str, Any]:
        """Return graph nodes and edges at one commit."""
        resolved = self._resolve_commit(commit_hash)
        module_rows = self.modules_at_commit(resolved)["modules"]
        nodes = []
        for module in module_rows:
            nodes.append(
                {
                    "module_name": module["module_name"],
                    "total_lines": module["total_lines"],
                    "line_categories": module["line_categories"],
                    "python_file_count": module["python_file_count"],
                    "method_count": module["cyclomatic"]["count"],
                    "cyclomatic_median": module["cyclomatic"]["median"],
                    "cognitive_median": module["cognitive"]["median"],
                    "jones_median": module["jones"]["median"],
                    "score_in": module["score_in"],
                    "score_out": module["score_out"],
                },
            )
        edges = []
        for edge in self.edges_at_commit(resolved, include_zero_score=include_zero_score):
            edges.append(
                {
                    "source": edge["source"],
                    "target": edge["target"],
                    "score": edge["score"],
                    "breakdown": edge["breakdown"],
                },
            )
        return {"commit_hash": resolved, "nodes": nodes, "edges": edges}

    def _require_edge(
        self,
        resolved: str,
        source: str,
        target: str,
        *,
        include_zero_score: bool,
    ) -> int:
        """Return edge score or raise when the pair is missing or excluded."""
        edge_row = self._connection.execute(
            """
            SELECT score
            FROM coupling_edge
            WHERE commit_hash = ? AND source_module = ? AND target_module = ?
            """,
            [resolved, source, target],
        ).fetchone()
        if edge_row is None:
            raise QueryNotFoundError(f"Unknown edge: {source} -> {target}")
        score = int(edge_row[0])
        if not edge_included(score, include_zero_score=include_zero_score):
            raise QueryNotFoundError(f"Unknown edge: {source} -> {target}")
        return score

    def edge_points(
        self,
        source: str,
        target: str,
        commit_hash: str | None = None,
        *,
        include_zero_score: bool = False,
    ) -> dict[str, Any]:
        """Return per-category points and evidence for one edge."""
        resolved = self._resolve_commit(commit_hash)
        score = self._require_edge(resolved, source, target, include_zero_score=include_zero_score)
        breakdown_row = self._connection.execute(
            """
            SELECT model_reuse, extension_or_method, view, field_property, total
            FROM coupling_edge_breakdown
            WHERE commit_hash = ? AND source_module = ? AND target_module = ?
            """,
            [resolved, source, target],
        ).fetchone()
        kind_rows = self._connection.execute(
            """
            SELECT kind, count
            FROM coupling_edge_kind
            WHERE commit_hash = ? AND source_module = ? AND target_module = ?
            ORDER BY kind
            """,
            [resolved, source, target],
        ).fetchall()
        return _edge_points_payload(
            resolved,
            source,
            target,
            score,
            breakdown_row,
            kind_rows,
            self.edge_evidence(resolved, source, target),
        )

    def edge_points_batch(
        self,
        pairs: list[tuple[str, str]],
        commit_hash: str | None = None,
        *,
        include_zero_score: bool = False,
    ) -> dict[str, Any]:
        """Return per-category points and evidence for many edges."""
        resolved = self._resolve_commit(commit_hash)
        unique_pairs = list(dict.fromkeys(pairs))
        if not unique_pairs:
            return {"commit_hash": resolved, "edges": [], "missing": []}
        pair_clause, pair_params = _pair_filter_sql(unique_pairs)
        edge_rows = self._connection.execute(
            f"""
            SELECT source_module, target_module, score
            FROM coupling_edge
            WHERE commit_hash = ? AND ({pair_clause})
            """,
            [resolved, *pair_params],
        ).fetchall()
        scores = {(row[0], row[1]): int(row[2]) for row in edge_rows}
        included: list[tuple[str, str, int]] = []
        missing: list[dict[str, str]] = []
        for source, target in unique_pairs:
            score = scores.get((source, target))
            if score is None or not edge_included(score, include_zero_score=include_zero_score):
                missing.append({"source": source, "target": target})
                continue
            included.append((source, target, score))
        if not included:
            return {"commit_hash": resolved, "edges": [], "missing": missing}
        pair_list = [(source, target) for source, target, _ in included]
        pair_clause, pair_params = _pair_filter_sql(pair_list)
        breakdown_rows = self._connection.execute(
            f"""
            SELECT source_module, target_module, model_reuse, extension_or_method, view, field_property, total
            FROM coupling_edge_breakdown
            WHERE commit_hash = ? AND ({pair_clause})
            """,
            [resolved, *pair_params],
        ).fetchall()
        breakdown_by_pair = {
            (row[0], row[1]): row[2:]
            for row in breakdown_rows
        }
        kind_rows_all = self._connection.execute(
            f"""
            SELECT source_module, target_module, kind, count
            FROM coupling_edge_kind
            WHERE commit_hash = ? AND ({pair_clause})
            ORDER BY source_module, target_module, kind
            """,
            [resolved, *pair_params],
        ).fetchall()
        kinds_by_pair: dict[tuple[str, str], list[tuple[str, int]]] = defaultdict(list)
        for source, target, kind, count in kind_rows_all:
            kinds_by_pair[(source, target)].append((kind, int(count)))
        evidence_rows_all = self._connection.execute(
            f"""
            SELECT source_module, target_module, kind, file_path, line, detail
            FROM coupling_edge_evidence
            WHERE commit_hash = ? AND ({pair_clause})
            ORDER BY source_module, target_module, line, kind, file_path
            """,
            [resolved, *pair_params],
        ).fetchall()
        evidence_by_pair: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for source, target, kind, file_path, line, detail in evidence_rows_all:
            evidence_by_pair[(source, target)].append(
                {"kind": kind, "file_path": file_path, "line": int(line), "detail": detail},
            )
        edges = [
            _edge_points_payload(
                resolved,
                source,
                target,
                score,
                breakdown_by_pair.get((source, target)),
                kinds_by_pair.get((source, target), []),
                evidence_by_pair.get((source, target), []),
            )
            for source, target, score in included
        ]
        return {"commit_hash": resolved, "edges": edges, "missing": missing}

    def edge_evidence_for_pair(
        self,
        source: str,
        target: str,
        commit_hash: str | None = None,
        *,
        include_zero_score: bool = False,
    ) -> dict[str, Any]:
        """Return evidence rows for one edge after inclusion checks."""
        resolved = self._resolve_commit(commit_hash)
        self._require_edge(resolved, source, target, include_zero_score=include_zero_score)
        return {
            "commit_hash": resolved,
            "source": source,
            "target": target,
            "evidence": self.edge_evidence(resolved, source, target),
        }

    def edge_evidence(
        self,
        commit_hash: str,
        source: str,
        target: str,
    ) -> list[dict[str, Any]]:
        """Return evidence rows for one edge at a commit."""
        rows = self._connection.execute(
            """
            SELECT kind, file_path, line, detail
            FROM coupling_edge_evidence
            WHERE commit_hash = ? AND source_module = ? AND target_module = ?
            ORDER BY line, kind, file_path
            """,
            [commit_hash, source, target],
        ).fetchall()
        return [
            {"kind": row[0], "file_path": row[1], "line": row[2], "detail": row[3]}
            for row in rows
        ]

    def module_models(
        self,
        module_name: str,
        commit_hash: str | None = None,
    ) -> dict[str, Any]:
        """Return declared and inherited model names for one module."""
        resolved = self._resolve_commit(commit_hash)
        if not self.module_exists_at_commit(module_name, resolved):
            raise QueryNotFoundError(f"Unknown module: {module_name}")
        model_lists = self._module_models_at_commit(resolved, module_name).get(
            module_name,
            {"declared": [], "inherited": []},
        )
        return {
            "commit_hash": resolved,
            "module_name": module_name,
            "declared_models": model_lists["declared"],
            "inherited_models": model_lists["inherited"],
        }

    def manifest_depends(
        self,
        module_name: str | None = None,
        commit_hash: str | None = None,
    ) -> dict[str, Any]:
        """Return in-scope manifest dependencies at one commit."""
        resolved = self._resolve_commit(commit_hash)
        if module_name is not None and not self.module_exists_at_commit(module_name, resolved):
            raise QueryNotFoundError(f"Unknown module: {module_name}")
        depends_by_module = self._manifest_depends_at_commit(resolved, module_name)
        if module_name is not None:
            return {
                "commit_hash": resolved,
                "module_name": module_name,
                "depends_on": depends_by_module.get(module_name, []),
            }
        return {
            "commit_hash": resolved,
            "depends": [
                {"module_name": mod_name, "depends_on": depends_on}
                for mod_name, depends in sorted(depends_by_module.items())
                for depends_on in depends
            ],
        }

    def module_lines_by_category_timeseries(self, module_name: str) -> list[dict[str, Any]]:
        """Return per-category line counts over commit history for one module."""
        if not self.module_exists(module_name):
            raise QueryNotFoundError(f"Unknown module: {module_name}")
        rows = self._connection.execute(
            """
            SELECT c.commit_order, c.commit_hash,
                   m.python_lines, m.js_lines, m.python_test_lines,
                   m.xml_lines, m.css_lines, m.html_lines
            FROM module_aggregate m
            JOIN commit c ON c.commit_hash = m.commit_hash
            WHERE m.module_name = ?
            ORDER BY c.commit_order
            """,
            [module_name],
        ).fetchall()
        series: list[dict[str, Any]] = []
        for row in rows:
            commit_order, commit_hash, *values = row
            for category, value in zip(_LINE_CATEGORY_COLUMNS, values, strict=True):
                series.append(
                    {
                        "commit_order": commit_order,
                        "commit_hash": commit_hash,
                        "category": category,
                        "value": value,
                    },
                )
        return series

    def python_file_count_timeseries(self, module_name: str) -> list[dict[str, Any]]:
        """Return python_file_count over commit history for one module."""
        if not self.module_exists(module_name):
            raise QueryNotFoundError(f"Unknown module: {module_name}")
        rows = self._connection.execute(
            """
            SELECT c.commit_order, c.commit_hash, m.python_file_count AS value
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

    def edge_kind_timeseries(self, kind: str | None = None) -> list[dict[str, Any]]:
        """Return edge-kind counts over commit history."""
        params: list[Any] = []
        kind_filter = ""
        if kind is not None:
            kind_filter = " AND k.kind = ?"
            params.append(kind)
        rows = self._connection.execute(
            f"""
            SELECT c.commit_order, c.commit_hash, k.kind, SUM(k.count) AS value
            FROM coupling_edge_kind k
            JOIN commit c ON c.commit_hash = k.commit_hash
            WHERE 1=1{kind_filter}
            GROUP BY c.commit_order, c.commit_hash, k.kind
            ORDER BY c.commit_order, k.kind
            """,
            params,
        ).fetchall()
        return [
            {
                "commit_order": row[0],
                "commit_hash": row[1],
                "kind": row[2],
                "value": int(row[3]),
            }
            for row in rows
        ]

    def relations_diff(self, commit_a: str, commit_b: str) -> dict[str, Any]:
        """Return added and removed coupling edges between two commits."""
        for label, commit_hash in (("commit_a", commit_a), ("commit_b", commit_b)):
            if not self.commit_exists(commit_hash):
                raise QueryNotFoundError(f"Unknown {label}: {commit_hash}")
        rows_a = {
            (row[0], row[1]): int(row[2])
            for row in self._connection.execute(
                """
                SELECT source_module, target_module, score
                FROM coupling_edge
                WHERE commit_hash = ?
                """,
                [commit_a],
            ).fetchall()
        }
        rows_b = {
            (row[0], row[1]): int(row[2])
            for row in self._connection.execute(
                """
                SELECT source_module, target_module, score
                FROM coupling_edge
                WHERE commit_hash = ?
                """,
                [commit_b],
            ).fetchall()
        }
        changes = []
        for key, score_b in rows_b.items():
            if key not in rows_a:
                changes.append(
                    {
                        "source": key[0],
                        "target": key[1],
                        "change": "added",
                        "score_a": None,
                        "score_b": score_b,
                    },
                )
        for key, score_a in rows_a.items():
            if key not in rows_b:
                changes.append(
                    {
                        "source": key[0],
                        "target": key[1],
                        "change": "removed",
                        "score_a": score_a,
                        "score_b": None,
                    },
                )
        return {"commit_a": commit_a, "commit_b": commit_b, "changes": changes}

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
            raise ValueError(f"Unsupported hotspot mode: {by}")
        table, name_column = _hotspot_target(level)
        column = f"{_metric_prefix(metric)}_{agg}"
        if agg not in _AGG_SUFFIXES:
            raise ValueError(f"Unsupported aggregation: {agg}")
        if by == "growth":
            rows = self._connection.execute(
                f"""
                WITH ranked AS (
                    SELECT {name_column} AS name,
                           {column} AS current,
                           FIRST({column}) OVER (
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
                SELECT {name_column} AS name, {column} AS current, c.commit_order,
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

    def coupling_structure_timeseries(
        self, *, include_zero_score: bool = False
    ) -> list[dict[str, Any]]:
        """Return coupling edge count and total score over commit history."""
        rows = self._connection.execute(
            """
            SELECT c.commit_order,
                   c.commit_hash,
                   COUNT(e.source_module) FILTER (
                       WHERE e.source_module IS NOT NULL
                         AND (? OR e.score >= 1)
                   ) AS edge_count,
                   COALESCE(
                       SUM(e.score) FILTER (
                           WHERE e.source_module IS NOT NULL
                             AND (? OR e.score >= 1)
                       ),
                       0,
                   ) AS total_score
            FROM commit c
            LEFT JOIN coupling_edge e ON e.commit_hash = c.commit_hash
            GROUP BY c.commit_order, c.commit_hash
            ORDER BY c.commit_order
            """,
            [include_zero_score, include_zero_score],
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

    def edges_at_commit(
        self,
        commit_hash: str | None = None,
        *,
        include_zero_score: bool = False,
    ) -> list[dict[str, Any]]:
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
        breakdown_rows = self._connection.execute(
            """
            SELECT source_module, target_module,
                   model_reuse, extension_or_method, view, field_property, total
            FROM coupling_edge_breakdown
            WHERE commit_hash = ?
            """,
            [commit_hash],
        ).fetchall()
        breakdown_by_edge = {
            (row[0], row[1]): _breakdown_dict(row[2:])
            for row in breakdown_rows
        }
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
        evidence_rows = self._connection.execute(
            """
            SELECT source_module, target_module, COUNT(*)
            FROM coupling_edge_evidence
            WHERE commit_hash = ?
            GROUP BY source_module, target_module
            """,
            [commit_hash],
        ).fetchall()
        evidence_by_edge = {(row[0], row[1]): int(row[2]) for row in evidence_rows}
        return [
            {
                "source": row[0],
                "target": row[1],
                "score": row[2],
                "kinds": kinds_by_edge.get((row[0], row[1]), {}),
                "kind_occurrence_count": sum(kinds_by_edge.get((row[0], row[1]), {}).values()),
                "evidence_count": evidence_by_edge.get((row[0], row[1]), 0),
                "breakdown": breakdown_by_edge.get(
                    (row[0], row[1]),
                    {
                        "model_reuse": 0,
                        "extension_or_method": 0,
                        "view": 0,
                        "field_property": 0,
                        "total": row[2],
                    },
                ),
                "commit_hash": commit_hash,
            }
            for row in rows
            if edge_included(int(row[2]), include_zero_score=include_zero_score)
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

    def failures_at_commit(self, commit_hash: str | None = None) -> dict[str, Any]:
        """Return analysis failures recorded for one commit."""
        resolved = self._resolve_commit(commit_hash)
        rows = self._connection.execute(
            """
            SELECT f.commit_hash, f.file_path, f.error_text
            FROM failure f
            INNER JOIN commit c ON c.commit_hash = f.commit_hash
            WHERE f.commit_hash = ?
            ORDER BY f.file_path, f.error_text
            """,
            [resolved],
        ).fetchall()
        return {
            "commit_hash": resolved,
            "failures": [
                {
                    "commit_hash": row[0],
                    "file_path": row[1],
                    "error_text": row[2],
                }
                for row in rows
            ],
        }

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
