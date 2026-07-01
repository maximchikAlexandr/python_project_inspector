"""Typed edge scoring via ``match EdgeKindGroup`` (no ``if`` chains).

Scoring is pure: input is an iterable of typed kind counts, output is a
generic ``dict[str, int]`` keyed by ``EdgeKindGroup.value``.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable

from ppi.core.odoo.facts import EdgeKindCount, breakdown_from_kind_counts
from ppi.core.value_objects import EdgeKind

__all__ = [
    "breakdown_from_kind_counts",
    "score_from_kind_counts",
    "score_from_kinds",
    "module_scores_from_edges",
]


def score_from_kind_counts(counts: Iterable[EdgeKindCount]) -> int:
    """Return the total graph points for typed kind counts."""
    return sum(breakdown_from_kind_counts(counts).values())


def score_from_kinds(kinds: Iterable[EdgeKind]) -> int:
    """Return the total graph points for an iterable of (unaggregated) kinds."""
    counter: Counter[EdgeKind] = Counter()
    for kind in kinds:
        counter[kind] += 1
    counts = tuple(EdgeKindCount(kind=k, count=c) for k, c in counter.items())
    return score_from_kind_counts(counts)


def module_scores_from_edges(
    module_names: Iterable[str],
    edges: Iterable[tuple[str, str, int]],
) -> dict[str, dict[str, int]]:
    """Build per-module ``{outgoing_score, incoming_score}`` from ``(src, tgt, score)``.

    Pure: input is already-aggregated edge triples; no mutation of edges.
    """
    stats: dict[str, dict[str, int]] = {
        name: {"outgoing_score": 0, "incoming_score": 0} for name in module_names
    }
    for source, target, score_value in edges:
        if score_value <= 0:
            continue
        if source in stats:
            stats[source]["outgoing_score"] += score_value
        if target in stats:
            stats[target]["incoming_score"] += score_value
    return stats