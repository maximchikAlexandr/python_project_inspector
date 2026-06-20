"""Contract tests for schema v2 writer persistence."""

from pathlib import Path

import duckdb

from ppi.core.contracts import (
    AnalysisBatch,
    CommitRef,
    CouplingEdge,
    Distribution,
    EdgeBreakdown,
    Evidence,
    FileMetrics,
    ModuleAggregate,
)
from ppi.storage.writer import StoreWriter


def _commit() -> CommitRef:
    """Build a minimal commit ref for writer tests."""
    return CommitRef(
        commit_hash="a" * 40,
        commit_order=0,
        author_name="Test",
        author_email="test@example.com",
        authored_at=1,
        committed_at=1,
        summary="init",
    )


def _distribution(value: float) -> Distribution:
    """Build a trivial distribution for writer tests."""
    return Distribution(
        count=1,
        mean=value,
        median=value,
        p95=value,
        max=value,
    )


def test_write_batch_inserts_v2_rows(tmp_path: Path):
    """write_batch persists breakdown, evidence, model, and manifest rows."""
    store_file = tmp_path / "history.duckdb"
    writer = StoreWriter(store_file)
    try:
        batch = AnalysisBatch(
            commit=_commit(),
            files=(
                FileMetrics(
                    module_name="base_module",
                    relative_path="models/partner.py",
                    category="python",
                    lines=10,
                    function_count=1,
                    jones_line_count=1,
                    cyclomatic=_distribution(1.0),
                    cognitive=_distribution(1.0),
                    jones=_distribution(1.0),
                    top_folder="models",
                ),
            ),
            modules=(
                ModuleAggregate(
                    module_name="base_module",
                    total_lines=10,
                    line_categories={"python_lines": 10},
                    cyclomatic=_distribution(1.0),
                    cognitive=_distribution(1.0),
                    jones=_distribution(1.0),
                    declared_models_count=1,
                    inherited_models_count=0,
                    python_complexity_parse_errors=0,
                    score_out=0,
                    score_in=1,
                    python_file_count=1,
                    declared_models=("base.partner",),
                    inherited_models=(),
                    manifest_depends=("linked_module",),
                ),
            ),
            edges=(
                CouplingEdge(
                    source_module="linked_module",
                    target_module="base_module",
                    score=2,
                    kinds={"python_many2one": 2},
                    breakdown=EdgeBreakdown(
                        model_reuse=2,
                        extension_or_method=0,
                        view=0,
                        field_property=0,
                        total=2,
                    ),
                    evidence=(
                        Evidence(
                            kind="python_many2one",
                            file_path="linked_module/models/order.py",
                            line=12,
                            detail="partner_id",
                        ),
                    ),
                ),
            ),
            failures=(),
        )
        writer.write_batch(batch, "run-1")
    finally:
        writer.close()

    connection = duckdb.connect(str(store_file), read_only=True)
    try:
        commit_hash = _commit().commit_hash
        breakdown = connection.execute(
            """
            SELECT model_reuse, extension_or_method, view, field_property, total
            FROM coupling_edge_breakdown
            WHERE commit_hash = ? AND source_module = ? AND target_module = ?
            """,
            [commit_hash, "linked_module", "base_module"],
        ).fetchone()
        assert breakdown == (2, 0, 0, 0, 2)

        evidence = connection.execute(
            """
            SELECT kind, file_path, line, detail
            FROM coupling_edge_evidence
            WHERE commit_hash = ? AND source_module = ? AND target_module = ?
            """,
            [commit_hash, "linked_module", "base_module"],
        ).fetchone()
        assert evidence == (
            "python_many2one",
            "linked_module/models/order.py",
            12,
            "partner_id",
        )

        models = connection.execute(
            """
            SELECT model_name, relation
            FROM module_model
            WHERE commit_hash = ? AND module_name = ?
            ORDER BY model_name
            """,
            [commit_hash, "base_module"],
        ).fetchall()
        assert models == [("base.partner", "declared")]

        depends = connection.execute(
            """
            SELECT depends_on
            FROM module_manifest_depend
            WHERE commit_hash = ? AND module_name = ?
            """,
            [commit_hash, "base_module"],
        ).fetchone()
        assert depends == ("linked_module",)

        file_row = connection.execute(
            """
            SELECT top_folder
            FROM file_metric
            WHERE commit_hash = ? AND module_name = ? AND relative_path = ?
            """,
            [commit_hash, "base_module", "models/partner.py"],
        ).fetchone()
        module_row = connection.execute(
            """
            SELECT python_file_count
            FROM module_aggregate
            WHERE commit_hash = ? AND module_name = ?
            """,
            [commit_hash, "base_module"],
        ).fetchone()
        assert file_row == ("models",)
        assert module_row == (1,)
    finally:
        connection.close()
