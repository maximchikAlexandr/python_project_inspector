"""Typed request value objects for query endpoints."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum

from ppi.query._params import _choice, _opt_bool, _opt_int, _opt_str, _req

__all__ = [
    "Aggregation",
    "HotspotBy",
    "HotspotsQuery",
]


class Aggregation(StrEnum):
    MEAN = "mean"
    MEDIAN = "median"
    P95 = "p95"
    MAX = "max"


class HotspotBy(StrEnum):
    VALUE = "value"
    GROWTH = "growth"


@dataclass(frozen=True, slots=True)
class HotspotsQuery:
    level: str
    metric_id: str
    by: HotspotBy
    limit: int
    agg: Aggregation

    @classmethod
    def from_params(cls, params: Mapping[str, object]) -> HotspotsQuery:
        level = _choice(dict(params), "level", {"module", "file"}, default="module")
        metric_id = _req(dict(params), "metric_id")
        by = HotspotBy(_choice(dict(params), "by", {"value", "growth"}, default="value"))
        limit = _opt_int(dict(params), "limit", 20)
        agg = Aggregation(_choice(dict(params), "agg", {"mean", "median", "p95", "max"}, default="mean"))
        return cls(level=level, metric_id=metric_id, by=by, limit=limit, agg=agg)
