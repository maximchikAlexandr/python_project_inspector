"""Unit tests for immutable edge facts and the pure edge reducer."""

from __future__ import annotations

import pytest

from ppi.core.odoo.facts import (
    CouplingEdgeSnapshot,
    EdgeFact,
    EdgeKindCount,
    breakdown_from_kind_counts,
    edge_breakdown_of,
    edge_facts_by_pair,
    reduce_edge_facts,
)
from ppi.core.value_objects import EdgeKind, EdgeKindGroup, ModuleName, edge_kind_group_of


def _fact(source: str, target: str, kind: EdgeKind) -> EdgeFact:
    return EdgeFact(source_module=ModuleName.of(source), target_module=ModuleName.of(target), kind=kind)


def test_edge_fact_pair():
    f = _fact("sale", "base", EdgeKind.PYTHON_MANY2ONE)
    assert f.pair == (ModuleName.of("sale"), ModuleName.of("base"))


def test_edge_kind_count_rejects_negative():
    with pytest.raises(ValueError):
        EdgeKindCount(kind=EdgeKind.XML_REF, count=-1)


def test_edge_breakdown_from_kind_counts_dispatch():
    counts = (
        EdgeKindCount(EdgeKind.PYTHON_MANY2ONE, 2),
        EdgeKindCount(EdgeKind.XML_REF, 3),
        EdgeKindCount(EdgeKind.PYTHON_FIELD_PROPERTY_ACCESS, 1),
        EdgeKindCount(EdgeKind.PYTHON_METHOD_CALL, 4),
    )
    bd = breakdown_from_kind_counts(counts)
    assert bd[EdgeKindGroup.MODEL_REUSE.value] == 2
    assert bd[EdgeKindGroup.VIEW.value] == 3
    assert bd[EdgeKindGroup.FIELD_PROPERTY.value] == 1
    assert bd[EdgeKindGroup.EXTENSION_OR_METHOD.value] == 4
    assert sum(bd.values()) == 10


def test_edge_breakdown_empty():
    assert sum(breakdown_from_kind_counts(()).values()) == 0
    assert sum({}.values()) == 0


def test_reduce_edge_facts_groups_by_pair():
    facts = (
        _fact("sale", "base", EdgeKind.PYTHON_MANY2ONE),
        _fact("sale", "base", EdgeKind.PYTHON_MANY2ONE),
        _fact("sale", "base", EdgeKind.XML_REF),
        _fact("base", "sale", EdgeKind.PYTHON_INHERIT),
    )
    snapshots = reduce_edge_facts(facts)
    assert len(snapshots) == 2
    ab = snapshots[1]
    assert ab.source_module == ModuleName.of("sale")
    assert ab.target_module == ModuleName.of("base")
    assert ab.kinds_map == {"python_many2one": 2, "xml_ref": 1}
    assert ab.breakdown[EdgeKindGroup.MODEL_REUSE.value] == 2
    assert ab.breakdown[EdgeKindGroup.VIEW.value] == 1
    assert ab.score == 3


def test_reduce_edge_facts_order_independent():
    facts_a = (
        _fact("sale", "base", EdgeKind.PYTHON_MANY2ONE),
        _fact("sale", "base", EdgeKind.XML_REF),
    )
    facts_b = reversed(facts_a)
    sa = reduce_edge_facts(facts_a)
    sb = reduce_edge_facts(facts_b)
    assert sa[0].kinds_map == sb[0].kinds_map
    assert sa[0].score == sb[0].score


def test_reduce_edge_facts_empty():
    assert reduce_edge_facts(()) == ()


def test_edge_facts_by_pair():
    facts = (
        _fact("sale", "base", EdgeKind.PYTHON_MANY2ONE),
        _fact("sale", "base", EdgeKind.XML_REF),
        _fact("base", "sale", EdgeKind.PYTHON_INHERIT),
    )
    grouped = edge_facts_by_pair(facts)
    assert len(grouped) == 2
    assert len(grouped[ModuleName.of("sale"), ModuleName.of("base")]) == 2


def test_edge_breakdown_of_facts():
    facts = (
        _fact("a", "b", EdgeKind.PYTHON_MANY2ONE),
        _fact("a", "b", EdgeKind.XML_REF),
        _fact("a", "b", EdgeKind.XML_REF),
    )
    bd = edge_breakdown_of(facts)
    assert bd[EdgeKindGroup.MODEL_REUSE.value] == 1
    assert bd[EdgeKindGroup.VIEW.value] == 2
    assert sum(bd.values()) == 3


def test_coupling_edge_snapshot_kinds_map():
    snap = CouplingEdgeSnapshot(
        source_module=ModuleName.of("sale"),
        target_module=ModuleName.of("base"),
        kind_counts=(EdgeKindCount(EdgeKind.XML_REF, 2),),
    )
    assert snap.kinds_map == {"xml_ref": 2}


def test_edge_kind_group_of_all_kinds():
    for kind in EdgeKind:
        assert edge_kind_group_of(kind) in EdgeKindGroup