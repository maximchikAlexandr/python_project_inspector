"""Single-writer DuckDB persistence for analysis batches."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import duckdb

from ppi.core.contracts import AnalysisBatch, AnalysisScope, Distribution, ProjectRef, RunMeta
from ppi.storage import schema


def _distribution_columns(prefix: str, distribution: Distribution) -> dict[str, float | int]:
    """Flatten one Distribution into SQL column values."""
    return {
        f"{prefix}_count": distribution.count,
        f"{prefix}_mean": distribution.mean,
        f"{prefix}_median": distribution.median,
        f"{prefix}_p95": distribution.p95,
        f"{prefix}_max": distribution.max,
    }


def _epoch_to_timestamp(epoch: int) -> datetime:
    """Convert epoch seconds to UTC datetime."""
    return datetime.fromtimestamp(epoch, tz=UTC)


def _join_scope_values(values: tuple[str, ...]) -> str:
    """Serialize a scope tuple for storage."""
    return ",".join(values)


def _split_scope_values(raw: str) -> tuple[str, ...]:
    """Deserialize a stored scope tuple."""
    if not raw:
        return ()
    return tuple(part for part in raw.split(",") if part)


class StoreWriter:
    """Write analysis batches into one DuckDB store."""

    def __init__(self, store_file: Path, tool_version: str = "0.1.0") -> None:
        """Open a read-write DuckDB connection."""
        store_file.parent.mkdir(parents=True, exist_ok=True)
        self._connection = duckdb.connect(str(store_file))
        schema.initialize_schema(self._connection, tool_version)
        schema.assert_schema_compatible(self._connection)

    def close(self) -> None:
        """Close the DuckDB connection."""
        self._connection.close()

    def clear_project_data(self) -> None:
        """Remove all stored history rows."""
        for table in (
            "failure",
            "coupling_edge_evidence",
            "coupling_edge_breakdown",
            "coupling_edge_kind",
            "coupling_edge",
            "module_manifest_depend",
            "module_model",
            "module_aggregate",
            "file_metric",
            "commit",
            "analysis_run",
            "project",
        ):
            self._connection.execute(f"DELETE FROM {table}")

    def stored_commit_hashes(self) -> set[str]:
        """Return commit hashes already present in the store."""
        rows = self._connection.execute("SELECT commit_hash FROM commit").fetchall()
        return {row[0] for row in rows}

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
                module_prefixes=_split_scope_values(row[5] or ""),
                include_modules=_split_scope_values(row[6] or ""),
                all_modules=bool(row[7]),
            ),
        )

    def upsert_project(self, project: ProjectRef) -> None:
        """Insert or replace the project row."""
        scope = project.scope or AnalysisScope(project_label="", all_modules=True)
        self._connection.execute(
            """
            INSERT OR REPLACE INTO project (
                project_id, repo_path, branch, profile,
                project_label, module_prefixes, include_modules, all_modules
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                project.project_id,
                project.repo_path,
                project.branch,
                project.profile,
                scope.project_label,
                _join_scope_values(scope.module_prefixes),
                _join_scope_values(scope.include_modules),
                scope.all_modules,
            ],
        )

    def start_run(self, run: RunMeta) -> None:
        """Insert a new analysis run row."""
        self._connection.execute(
            """
            INSERT INTO analysis_run (
                run_id, branch, mode, status, started_at, finished_at,
                commits_total, commits_succeeded, commits_failed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                run.run_id,
                run.branch,
                run.mode,
                run.status,
                _epoch_to_timestamp(run.started_at),
                _epoch_to_timestamp(run.finished_at) if run.finished_at is not None else None,
                run.commits_total,
                run.commits_succeeded,
                run.commits_failed,
            ],
        )

    def finish_run(self, run: RunMeta) -> None:
        """Update run counters and status."""
        self._connection.execute(
            """
            UPDATE analysis_run
            SET status = ?, finished_at = ?, commits_total = ?, commits_succeeded = ?, commits_failed = ?
            WHERE run_id = ?
            """,
            [
                run.status,
                _epoch_to_timestamp(run.finished_at) if run.finished_at is not None else None,
                run.commits_total,
                run.commits_succeeded,
                run.commits_failed,
                run.run_id,
            ],
        )

    def write_batch(self, batch: AnalysisBatch, run_id: str) -> None:
        """Persist one analysis batch in a single transaction."""
        commit = batch.commit
        has_metrics = bool(batch.files or batch.modules or batch.edges)
        failure_only = bool(batch.failures) and not has_metrics
        self._connection.execute("BEGIN TRANSACTION")
        try:
            if not failure_only:
                self._connection.execute(
                    """
                    INSERT OR REPLACE INTO commit (
                        commit_hash, commit_order, author_name, author_email,
                        authored_at, committed_at, summary
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        commit.commit_hash,
                        commit.commit_order,
                        commit.author_name,
                        commit.author_email,
                        _epoch_to_timestamp(commit.authored_at),
                        _epoch_to_timestamp(commit.committed_at),
                        commit.summary,
                    ],
                )
            for file_metric in batch.files:
                cc = _distribution_columns("cc", file_metric.cyclomatic)
                cog = _distribution_columns("cog", file_metric.cognitive)
                jones = _distribution_columns("jones", file_metric.jones)
                self._connection.execute(
                    """
                    INSERT OR REPLACE INTO file_metric (
                        commit_hash, module_name, relative_path, category, lines,
                        function_count, jones_line_count, top_folder,
                        cc_count, cc_mean, cc_median, cc_p95, cc_max,
                        cog_count, cog_mean, cog_median, cog_p95, cog_max,
                        jones_count, jones_mean, jones_median, jones_p95, jones_max,
                        parse_error
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        commit.commit_hash,
                        file_metric.module_name,
                        file_metric.relative_path,
                        file_metric.category,
                        file_metric.lines,
                        file_metric.function_count,
                        file_metric.jones_line_count,
                        file_metric.top_folder,
                        cc["cc_count"],
                        cc["cc_mean"],
                        cc["cc_median"],
                        cc["cc_p95"],
                        cc["cc_max"],
                        cog["cog_count"],
                        cog["cog_mean"],
                        cog["cog_median"],
                        cog["cog_p95"],
                        cog["cog_max"],
                        jones["jones_count"],
                        jones["jones_mean"],
                        jones["jones_median"],
                        jones["jones_p95"],
                        jones["jones_max"],
                        file_metric.parse_error,
                    ],
                )
            for module in batch.modules:
                cc = _distribution_columns("cc", module.cyclomatic)
                cog = _distribution_columns("cog", module.cognitive)
                jones = _distribution_columns("jones", module.jones)
                categories = module.line_categories
                self._connection.execute(
                    """
                    INSERT OR REPLACE INTO module_aggregate (
                        commit_hash, module_name, total_lines,
                        python_lines, js_lines, python_test_lines, xml_lines, css_lines, html_lines,
                        python_file_count,
                        cc_count, cc_mean, cc_median, cc_p95, cc_max,
                        cog_count, cog_mean, cog_median, cog_p95, cog_max,
                        jones_count, jones_mean, jones_median, jones_p95, jones_max,
                        declared_models_count, inherited_models_count,
                        python_complexity_parse_errors, score_out, score_in
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        commit.commit_hash,
                        module.module_name,
                        module.total_lines,
                        categories.get("python_lines", 0),
                        categories.get("js_lines", 0),
                        categories.get("python_test_lines", 0),
                        categories.get("xml_lines", 0),
                        categories.get("css_lines", 0),
                        categories.get("html_lines", 0),
                        module.python_file_count,
                        cc["cc_count"],
                        cc["cc_mean"],
                        cc["cc_median"],
                        cc["cc_p95"],
                        cc["cc_max"],
                        cog["cog_count"],
                        cog["cog_mean"],
                        cog["cog_median"],
                        cog["cog_p95"],
                        cog["cog_max"],
                        jones["jones_count"],
                        jones["jones_mean"],
                        jones["jones_median"],
                        jones["jones_p95"],
                        jones["jones_max"],
                        module.declared_models_count,
                        module.inherited_models_count,
                        module.python_complexity_parse_errors,
                        module.score_out,
                        module.score_in,
                    ],
                )
                for model_name in module.declared_models:
                    self._connection.execute(
                        """
                        INSERT OR REPLACE INTO module_model (
                            commit_hash, module_name, model_name, relation
                        ) VALUES (?, ?, ?, ?)
                        """,
                        [commit.commit_hash, module.module_name, model_name, "declared"],
                    )
                for model_name in module.inherited_models:
                    self._connection.execute(
                        """
                        INSERT OR REPLACE INTO module_model (
                            commit_hash, module_name, model_name, relation
                        ) VALUES (?, ?, ?, ?)
                        """,
                        [commit.commit_hash, module.module_name, model_name, "inherited"],
                    )
                for depends_on in module.manifest_depends:
                    self._connection.execute(
                        """
                        INSERT OR REPLACE INTO module_manifest_depend (
                            commit_hash, module_name, depends_on
                        ) VALUES (?, ?, ?)
                        """,
                        [commit.commit_hash, module.module_name, depends_on],
                    )
            for edge in batch.edges:
                self._connection.execute(
                    """
                    INSERT OR REPLACE INTO coupling_edge (
                        commit_hash, source_module, target_module, score
                    ) VALUES (?, ?, ?, ?)
                    """,
                    [commit.commit_hash, edge.source_module, edge.target_module, edge.score],
                )
                for kind, count in edge.kinds.items():
                    self._connection.execute(
                        """
                        INSERT OR REPLACE INTO coupling_edge_kind (
                            commit_hash, source_module, target_module, kind, count
                        ) VALUES (?, ?, ?, ?, ?)
                        """,
                        [commit.commit_hash, edge.source_module, edge.target_module, kind, count],
                    )
                if edge.breakdown is not None:
                    self._connection.execute(
                        """
                        INSERT OR REPLACE INTO coupling_edge_breakdown (
                            commit_hash, source_module, target_module,
                            model_reuse, extension_or_method, view, field_property, total
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        [
                            commit.commit_hash,
                            edge.source_module,
                            edge.target_module,
                            edge.breakdown.model_reuse,
                            edge.breakdown.extension_or_method,
                            edge.breakdown.view,
                            edge.breakdown.field_property,
                            edge.breakdown.total,
                        ],
                    )
                for item in edge.evidence:
                    self._connection.execute(
                        """
                        INSERT INTO coupling_edge_evidence (
                            commit_hash, source_module, target_module,
                            kind, file_path, line, detail
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        [
                            commit.commit_hash,
                            edge.source_module,
                            edge.target_module,
                            item.kind,
                            item.file_path,
                            item.line,
                            item.detail,
                        ],
                    )
            for failure in batch.failures:
                self._connection.execute(
                    """
                    INSERT INTO failure (run_id, commit_hash, file_path, error_text)
                    VALUES (?, ?, ?, ?)
                    """,
                    [run_id, failure.commit_hash, failure.file_path, failure.error_text],
                )
            self._connection.execute("COMMIT")
        except Exception:
            self._connection.execute("ROLLBACK")
            raise
