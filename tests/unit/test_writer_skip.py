"""Unit tests for store writer incremental skip behavior."""

from pathlib import Path

from ppi.core.contracts import (
    AnalysisBatch,
    CommitRef,
    Distribution,
    FailureRecord,
    ModuleAggregate,
)
from ppi.storage.writer import StoreWriter


def _commit(order: int = 0) -> CommitRef:
    """Build a minimal commit ref for tests."""
    return CommitRef(
        commit_hash=f"{'a' * 39}{order}",
        commit_order=order,
        author_name="T",
        author_email="t@e.com",
        authored_at=1,
        committed_at=1,
        summary="test",
    )


def _module_batch(order: int = 0) -> AnalysisBatch:
    """Build a batch with one module aggregate."""
    return AnalysisBatch(
        commit=_commit(order),
        files=(),
        modules=(
            ModuleAggregate(
                module_name="demo_module",
                total_lines=10,
                line_categories={"python_lines": 10},
                cyclomatic=Distribution(count=1, mean=1.0, median=1.0, p95=1.0, max=1.0),
                cognitive=Distribution(count=1, mean=1.0, median=1.0, p95=1.0, max=1.0),
                jones=Distribution(count=1, mean=1.0, median=1.0, p95=1.0, max=1.0),
                declared_models_count=0,
                inherited_models_count=0,
                python_complexity_parse_errors=0,
                score_out=0,
                score_in=0,
            ),
        ),
        edges=(),
        failures=(),
    )


def test_failed_batch_is_not_stored_for_incremental_skip(tmp_path: Path):
    """Failure-only batches are retried on incremental analyze."""
    store_file = tmp_path / "history.duckdb"
    writer = StoreWriter(store_file)
    try:
        failure_batch = AnalysisBatch(
            commit=_commit(0),
            files=(),
            modules=(),
            edges=(),
            failures=(
                FailureRecord(
                    commit_hash=_commit(0).commit_hash,
                    file_path=None,
                    error_text="simulated failure",
                ),
            ),
        )
        writer.write_batch(failure_batch, "run-1")
        assert writer.stored_commit_hashes() == set()
        writer.write_batch(_module_batch(0), "run-1")
        assert writer.stored_commit_hashes() == {_commit(0).commit_hash}

        empty_success = AnalysisBatch(
            commit=_commit(1),
            files=(),
            modules=(),
            edges=(),
            failures=(),
        )
        writer.write_batch(empty_success, "run-1")
        assert _commit(1).commit_hash in writer.stored_commit_hashes()
    finally:
        writer.close()
