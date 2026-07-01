"""Contract tests for schema v3 writer persistence."""

from pathlib import Path

import duckdb

from ppi.core.contracts import (
    AnalysisBatch,
    CommitRef,
    CouplingEdge,
    Distribution,
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


def test_write_batch_inserts_v3_rows(tmp_path: Path):
    """write_batch persists JSON-column module/edge rows."""
    store_file = tmp_path / "history.duckdb"
    writer = StoreWriter(store_file)
    try:
        batch = AnalysisBatch(
            commit=_commit(),
            files=(
                FileMetrics(
                    module_name="base_module",
                    relative_path="models/partner.py",
                    line_category_id="python_lines",
                    metrics={"cyclomatic_mean": 1.0},
                    line_counts={"lines": 10, "function_count": 1, "jones_line_count": 1},
                    distributions={"cyclomatic": _distribution(1.0)},
                ),
            ),
            modules=(
                ModuleAggregate(
                    module_name="base_module",
                    total_lines=10,
                    metrics={"cyclomatic_mean": 1.0, "python_file_count": 1},
                    line_counts={"python_lines": 10},
                    distributions={"cyclomatic": _distribution(1.0)},
                ),
            ),
            edges=(
                CouplingEdge(
                    source_module="linked_module",
                    target_module="base_module",
                    score=2,
                    kinds={"python_many2one": 2},
                    breakdown={"model_reuse": 2},
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

        edge = connection.execute(
            """
            SELECT score, kinds, breakdown
            FROM coupling_edge
            WHERE commit_hash = ? AND source_module = ? AND target_module = ?
            """,
            [commit_hash, "linked_module", "base_module"],
        ).fetchone()
        assert edge is not None
        assert edge[0] == 2

        module_row = connection.execute(
            """
            SELECT total_lines, metrics, line_counts
            FROM module_aggregate
            WHERE commit_hash = ? AND module_name = ?
            """,
            [commit_hash, "base_module"],
        ).fetchone()
        assert module_row is not None
        assert module_row[0] == 10

        file_row = connection.execute(
            """
            SELECT line_category_id, metrics, line_counts
            FROM file_metric
            WHERE commit_hash = ? AND module_name = ? AND relative_path = ?
            """,
            [commit_hash, "base_module", "models/partner.py"],
        ).fetchone()
        assert file_row is not None
        assert file_row[0] == "python_lines"
    finally:
        connection.close()