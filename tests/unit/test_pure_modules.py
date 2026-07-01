"""Unit tests for complexity value objects, distribution stats, file
classification and edge scoring (pure modules)."""

from __future__ import annotations

import pytest

from ppi.core.odoo.complexity import (
    CognitiveScore,
    ComplexityMetrics,
    CyclomaticScore,
    FileComplexityInfo,
    FunctionCount,
    JonesLineScore,
    LineCount,
)
from ppi.core.odoo.dist_stats import DistributionStats, build_distribution_stats
from ppi.core.odoo.edge_scoring import (
    breakdown_from_kind_counts,
    module_scores_from_edges,
    score_from_kind_counts,
    score_from_kinds,
)
from ppi.core.odoo.facts import EdgeKindCount, breakdown_from_kind_counts
from ppi.core.odoo.file_classification import (
    classify_file_by_suffix,
    classify_relative_file,
    is_test_file_by_parts,
)
from ppi.core.value_objects import EdgeKind, EdgeKindGroup, LineCategory

# --- dist_stats ------------------------------------------------------------


def test_build_distribution_stats_empty():
    s = build_distribution_stats([])
    assert s.count == 0
    assert s.max == 0.0


def test_build_distribution_stats_values():
    s = build_distribution_stats([1, 2, 3, 4, 100])
    assert s.count == 5
    assert s.max == 100.0
    assert s.median == 3.0


def test_distribution_stats_rejects_negative_count():
    with pytest.raises(ValueError):
        DistributionStats(count=-1)


def test_distribution_stats_equality_and_hash():
    a = DistributionStats(count=2, mean=1.0, median=1.0, p95=2.0, max=2.0)
    b = DistributionStats(count=2, mean=1.0, median=1.0, p95=2.0, max=2.0)
    assert a == b
    assert hash(a) == hash(b)


# --- complexity value objects ----------------------------------------------


def test_cyclomatic_score_ok():
    assert int(CyclomaticScore(value=5)) == 5


def test_cyclomatic_score_rejects_negative():
    with pytest.raises(ValueError):
        CyclomaticScore(value=-1)


def test_cognitive_score_ok():
    assert int(CognitiveScore(value=0)) == 0


def test_jones_line_score_rejects_negative():
    with pytest.raises(ValueError):
        JonesLineScore(value=-1)


def test_function_count_ok():
    assert int(FunctionCount(value=3)) == 3


def test_line_count_rejects_negative():
    with pytest.raises(ValueError):
        LineCount(value=-1)


def test_complexity_metrics_from_score_tuples():
    m = ComplexityMetrics.from_score_tuples((1, 2, 3), (4, 5), (6,))
    assert m.cyclomatic.count == 3
    assert m.cognitive.count == 2
    assert m.jones.count == 1


def test_file_complexity_info_validates():
    f = FileComplexityInfo(
        relative_path="x.py",
        lines=10,
        function_count=2,
        jones_line_count=5,
        complexity=ComplexityMetrics.empty(),
    )
    assert f.lines == 10
    with pytest.raises(ValueError):
        FileComplexityInfo(
            relative_path="x.py",
            lines=-1,
            function_count=0,
            jones_line_count=0,
            complexity=ComplexityMetrics.empty(),
        )


# --- file_classification ---------------------------------------------------


def test_classify_file_by_suffix_all():
    assert classify_file_by_suffix(".py") is LineCategory.PYTHON
    assert classify_file_by_suffix(".js") is LineCategory.JS
    assert classify_file_by_suffix(".xml") is LineCategory.XML
    assert classify_file_by_suffix(".html") is LineCategory.HTML
    assert classify_file_by_suffix(".css") is LineCategory.CSS
    assert classify_file_by_suffix(".scss") is LineCategory.CSS
    assert classify_file_by_suffix(".less") is LineCategory.CSS
    assert classify_file_by_suffix(".sass") is LineCategory.CSS
    assert classify_file_by_suffix(".md") is None


def test_is_test_file_by_parts():
    assert is_test_file_by_parts(("tests",), "test_order.py") is True
    assert is_test_file_by_parts(("models",), "order.py") is False
    assert is_test_file_by_parts(("models",), "order_test.py") is True
    assert is_test_file_by_parts(("static",), "x.test.js") is True
    assert is_test_file_by_parts(("static",), "x.spec.js") is True
    assert is_test_file_by_parts(("__tests__",), "x.py") is True


def test_classify_relative_file_python_prod():
    assert classify_relative_file("models/order.py") is LineCategory.PYTHON


def test_classify_relative_file_python_test():
    assert classify_relative_file("tests/test_order.py") is LineCategory.PYTHON_TEST


def test_classify_relative_file_unknown():
    assert classify_relative_file("README.md") is None


def test_classify_relative_file_js():
    assert classify_relative_file("static/x.js") is LineCategory.JS


# --- edge_scoring ----------------------------------------------------------


def test_breakdown_from_kind_counts():
    counts = (
        EdgeKindCount(EdgeKind.PYTHON_MANY2ONE, 2),
        EdgeKindCount(EdgeKind.XML_REF, 3),
        EdgeKindCount(EdgeKind.PYTHON_METHOD_CALL, 4),
        EdgeKindCount(EdgeKind.PYTHON_FIELD_PROPERTY_ACCESS, 1),
    )
    bd = breakdown_from_kind_counts(counts)
    assert bd[EdgeKindGroup.MODEL_REUSE.value] == 2
    assert bd[EdgeKindGroup.VIEW.value] == 3
    assert bd[EdgeKindGroup.EXTENSION_OR_METHOD.value] == 4
    assert bd[EdgeKindGroup.FIELD_PROPERTY.value] == 1
    assert sum(bd.values()) == 10


def test_score_from_kind_counts():
    counts = (EdgeKindCount(EdgeKind.PYTHON_MANY2ONE, 2), EdgeKindCount(EdgeKind.XML_REF, 1))
    assert score_from_kind_counts(counts) == 3


def test_score_from_kinds():
    assert (
        score_from_kinds([EdgeKind.PYTHON_MANY2ONE, EdgeKind.PYTHON_MANY2ONE, EdgeKind.XML_REF])
        == 3
    )


def test_module_scores_from_edges():
    scores = module_scores_from_edges(
        ["sale", "base"],
        [("sale", "base", 5), ("base", "sale", 0)],
    )
    assert scores["sale"]["outgoing_score"] == 5
    assert scores["base"]["incoming_score"] == 5
    assert scores["base"]["outgoing_score"] == 0


def test_module_scores_from_edges_unknown_modules_ignored():
    scores = module_scores_from_edges(["sale"], [("sale", "base", 5)])
    assert scores["sale"]["outgoing_score"] == 5
    assert "base" not in scores


def test_edge_breakdown_total():
    bd = {
        EdgeKindGroup.MODEL_REUSE.value: 1,
        EdgeKindGroup.VIEW.value: 2,
        EdgeKindGroup.EXTENSION_OR_METHOD.value: 3,
        EdgeKindGroup.FIELD_PROPERTY.value: 4,
    }
    assert sum(bd.values()) == 10