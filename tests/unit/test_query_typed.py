"""Unit tests for typed query errors and request value objects."""

from __future__ import annotations

import pytest

from ppi.query.errors import QueryError, QueryErrorCode, QueryFailure, raise_query_failure
from ppi.query.requests import (
    Aggregation,
    HotspotBy,
    HotspotsQuery,
)

# --- errors ----------------------------------------------------------------


def test_query_failure_of_ok():
    f = QueryFailure.of("INVALID_PARAMS", "x required", http_status=422)
    assert f.code is QueryErrorCode.INVALID_PARAMS
    assert f.http_status == 422


def test_query_failure_rejects_empty_message():
    with pytest.raises(ValueError):
        QueryFailure.of("INVALID_PARAMS", "", http_status=422)


def test_query_failure_rejects_out_of_range_status():
    with pytest.raises(ValueError):
        QueryFailure.of("INVALID_PARAMS", "ok", http_status=200)
    with pytest.raises(ValueError):
        QueryFailure.of("INVALID_PARAMS", "ok", http_status=600)


def test_query_error_wrapper_legacy_props():
    try:
        raise_query_failure("METHOD_NOT_FOUND", "unknown", http_status=404)
    except QueryError as exc:
        assert exc.code == "METHOD_NOT_FOUND"
        assert exc.message == "unknown"
        assert exc.http_status == 404
        assert exc.failure.code is QueryErrorCode.METHOD_NOT_FOUND


def test_raise_query_failure_raises():
    with pytest.raises(QueryError):
        raise_query_failure("LOCKED", "busy", http_status=409)


# --- requests --------------------------------------------------------------


def test_hotspots_query_defaults():
    q = HotspotsQuery.from_params({"metric_id": "cyclomatic"})
    assert q.level == "module"
    assert q.metric_id == "cyclomatic"
    assert q.by is HotspotBy.VALUE
    assert q.limit == 20
    assert q.agg is Aggregation.MEAN


def test_hotspots_query_explicit():
    q = HotspotsQuery.from_params(
        {"level": "file", "metric_id": "cognitive", "by": "growth", "limit": "5", "agg": "max"}
    )
    assert q.level == "file"
    assert q.metric_id == "cognitive"
    assert q.by is HotspotBy.GROWTH
    assert q.limit == 5
    assert q.agg is Aggregation.MAX