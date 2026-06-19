"""Unit tests for pure metric transforms in the Odoo pipeline."""

from python_project_inspector.core.odoo.pipeline import (
    CouplingEdge,
    build_distribution_stats,
    edge_score,
)


def test_build_distribution_stats_empty():
    """Empty input yields zeroed distribution stats."""
    stats = build_distribution_stats([])
    assert stats.count == 0
    assert stats.mean == 0.0


def test_build_distribution_stats_values():
    """Distribution stats summarize count/mean/median/p95/max."""
    stats = build_distribution_stats([1, 2, 3, 10])
    assert stats.count == 4
    assert stats.mean == 4.0
    assert stats.median == 2.5
    assert stats.max == 10.0
    assert stats.p95 == 10.0


def test_edge_score_weights_kinds():
    """Coupling score applies kind weights from the legacy formula."""
    edge = CouplingEdge(
        source_module="a",
        target_module="b",
        kind_counter={"python__inherit": 2, "python_method_call": 1},
    )
    assert edge_score(edge) == 3
