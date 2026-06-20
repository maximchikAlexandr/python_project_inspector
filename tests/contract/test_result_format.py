"""Contract tests for AnalysisBatch JSONL format."""

from ppi.core.contracts import (
    AnalysisBatch,
    CommitRef,
    Distribution,
    FileMetrics,
    batch_from_json,
    batch_to_json,
)


def test_batch_jsonl_roundtrip():
    """AnalysisBatch JSONL preserves commit + file + metrics keys."""
    batch = AnalysisBatch(
        commit=CommitRef(
            commit_hash="abc",
            commit_order=0,
            author_name="a",
            author_email="a@example.com",
            authored_at=1,
            committed_at=1,
            summary="init",
        ),
        files=(
            FileMetrics(
                module_name="demo_module",
                relative_path="models.py",
                category="python_lines",
                lines=3,
                function_count=1,
                jones_line_count=2,
                cyclomatic=Distribution(1, 1.0, 1.0, 1.0, 1.0),
                cognitive=Distribution(1, 1.0, 1.0, 1.0, 1.0),
                jones=Distribution(1, 1.0, 1.0, 1.0, 1.0),
                parse_error=None,
            ),
        ),
        modules=(),
        edges=(),
        failures=(),
    )
    restored = batch_from_json(batch_to_json(batch))
    assert restored.commit.commit_hash == "abc"
    assert restored.files[0].relative_path == "models.py"
    assert restored.files[0].lines == 3
