"""Immutable coupling-edge value objects (facts and snapshots).

The graph is built as a pure pipeline:

    EdgeFact[] -> reduce_edge_facts -> CouplingEdgeSnapshot[]

Evidence collection has been removed; breakdown is now a generic
``dict[str, int]`` keyed by ``relation_type_id`` (EdgeKind.value).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from types import MappingProxyType

from ppi.core.value_objects import (
    ContractError,
    EdgeKind,
    EdgeKindGroup,
    ModuleName,
    edge_kind_group_of,
    edge_kind_of,
)

__all__ = [
    "EdgeFact",
    "EdgeKindCount",
    "CouplingEdgeSnapshot",
    "reduce_edge_facts",
    "score_edge_snapshot",
    "edge_breakdown_of",
    "edge_facts_by_pair",
]


@dataclass(frozen=True, slots=True)
class EdgeFact:
    """One immutable piece of coupling between two modules."""

    source_module: ModuleName
    target_module: ModuleName
    kind: EdgeKind

    @property
    def pair(self) -> tuple[ModuleName, ModuleName]:
        """Return the (source, target) module pair key."""
        return (self.source_module, self.target_module)


@dataclass(frozen=True, slots=True)
class EdgeKindCount:
    """One (kind, count) record inside a coupling edge snapshot."""

    kind: EdgeKind
    count: int

    def __post_init__(self) -> None:
        if not isinstance(self.count, int) or isinstance(self.count, bool) or self.count < 0:
            raise ContractError(
                f"EdgeKindCount.count must be a non-negative int, got {self.count!r}"
            )


def breakdown_from_kind_counts(counts: Iterable[EdgeKindCount]) -> dict[str, int]:
    """Build a generic breakdown dict from kind counts.

    Returns a ``dict[str, int]`` keyed by ``EdgeKindGroup.value``.
    """
    breakdown: dict[str, int] = {}
    for record in counts:
        group = edge_kind_group_of(record.kind)
        key = group.value
        breakdown[key] = breakdown.get(key, 0) + record.count
    return breakdown


@dataclass(frozen=True, slots=True)
class CouplingEdgeSnapshot:
    """Immutable snapshot of one directed coupling edge between two modules."""

    source_module: ModuleName
    target_module: ModuleName
    kind_counts: tuple[EdgeKindCount, ...] = ()
    breakdown: dict[str, int] = field(default_factory=dict)

    @property
    def score(self) -> int:
        """Return the total graph points for this edge."""
        return sum(self.breakdown.values())

    @property
    def kinds_map(self) -> Mapping[str, int]:
        """Return a read-only ``{kind_value: count}`` mapping (F3)."""
        return MappingProxyType(
            {record.kind.value: record.count for record in self.kind_counts}
        )


def edge_facts_by_pair(
    facts: Iterable[EdgeFact],
) -> Mapping[tuple[ModuleName, ModuleName], tuple[EdgeFact, ...]]:
    """Group an iterable of edge facts by their (source, target) pair."""
    grouped: dict[tuple[ModuleName, ModuleName], list[EdgeFact]] = {}
    for fact in facts:
        grouped.setdefault(fact.pair, []).append(fact)
    return {pair: tuple(items) for pair, items in grouped.items()}


def edge_breakdown_of(facts: Iterable[EdgeFact]) -> dict[str, int]:
    """Compute a generic breakdown dict from raw facts via group dispatch."""
    counter: Counter[EdgeKind] = Counter()
    for fact in facts:
        counter[fact.kind] += 1
    counts = tuple(EdgeKindCount(kind=kind, count=count) for kind, count in counter.items())
    return breakdown_from_kind_counts(counts)


def score_edge_snapshot(snapshot: CouplingEdgeSnapshot) -> int:
    """Return the total score for a snapshot."""
    return snapshot.score


def reduce_edge_facts(facts: Iterable[EdgeFact]) -> tuple[CouplingEdgeSnapshot, ...]:
    """Reduce a stream of :class:`EdgeFact` into immutable snapshots.

    Order of input does not affect the resulting graph state: facts are grouped
    by pair, kinds are counted deterministically, and breakdowns are derived via
    typed group dispatch. No I/O and no hidden mutation.
    """
    grouped = edge_facts_by_pair(facts)
    snapshots: list[CouplingEdgeSnapshot] = []
    for (source, target), pair_facts in grouped.items():
        counter: Counter[EdgeKind] = Counter()
        for fact in pair_facts:
            counter[fact.kind] += 1
        kind_counts = tuple(
            EdgeKindCount(kind=kind, count=count)
            for kind, count in sorted(counter.items(), key=lambda item: item[0].value)
        )
        breakdown = breakdown_from_kind_counts(kind_counts)
        snapshots.append(
            CouplingEdgeSnapshot(
                source_module=source,
                target_module=target,
                kind_counts=kind_counts,
                breakdown=breakdown,
            )
        )
    snapshots.sort(key=lambda s: (s.source_module.value, s.target_module.value))
    return tuple(snapshots)


