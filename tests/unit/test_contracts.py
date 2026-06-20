"""Unit tests for msgspec contract serialization."""

from ppi.core.contracts import (
    AnalysisBatch,
    CommitRef,
    Distribution,
    batch_from_json,
    batch_to_json,
)


def _sample_batch() -> AnalysisBatch:
    """Build a minimal analysis batch fixture."""
    return AnalysisBatch(
        commit=CommitRef(
            commit_hash="abc",
            commit_order=0,
            author_name="Test",
            author_email="test@example.com",
            authored_at=1,
            committed_at=1,
            summary="init",
        ),
        files=(),
        modules=(),
        edges=(),
        failures=(),
    )


def test_batch_json_roundtrip():
    """AnalysisBatch survives JSON encode/decode unchanged."""
    batch = _sample_batch()
    restored = batch_from_json(batch_to_json(batch))
    assert restored.commit.commit_hash == "abc"
    assert restored.commit.commit_order == 0


def test_distribution_defaults():
    """Distribution struct stores aggregate metric fields."""
    dist = Distribution(count=2, mean=1.5, median=1.5, p95=2.0, max=2.0)
    assert dist.count == 2
    assert dist.mean == 1.5
