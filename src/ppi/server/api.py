"""HTTP endpoints for the dashboard.

Thin FastAPI wrappers that validate parameters (OpenAPI) and delegate every read
to the shared ``ppi.query.dispatch`` so ``ppi serve`` and ``ppi rpc`` share one
implementation (Spec FR-008/SC-003). Only HTTP-specific concerns (request state,
response models, QueryError -> HTTPException mapping) live here.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from ppi.query import QueryError, dispatch, schemas
from ppi.runtime import lock as project_lock
from ppi.storage import schema
from ppi.storage.queries import StoreReader

router = APIRouter()


def _open_reader_or_schema_error(
    request: Request,
    *,
    migrate: bool = True,
) -> tuple[StoreReader | None, schema.SchemaIncompatibleError | None]:
    """Open a read-only store reader or capture schema incompatibility.

    Returns ``(None, None)`` when the store file is absent so the dispatcher can
    raise ``STORE_NOT_FOUND`` uniformly for both transports.
    """
    store_file = request.app.state.store_file
    if not store_file.is_file():
        return None, None
    try:
        return StoreReader(store_file, read_only=True, migrate=migrate), None
    except schema.SchemaIncompatibleError as exc:
        return None, exc


def _dispatch_http(request: Request, method: str, params: dict) -> Any:
    """Delegate one dashboard read to the shared dispatcher and map errors to HTTP."""
    writer_active = project_lock.is_locked(request.app.state.lock_file)
    store_present = request.app.state.store_file.is_file()
    reader, schema_error = _open_reader_or_schema_error(request, migrate=not writer_active)
    try:
        return dispatch(
            reader,
            method,
            params,
            writer_active=writer_active,
            store_present=store_present,
            schema_error=schema_error,
        )
    except QueryError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc
    finally:
        if reader is not None:
            reader.close()


@router.get("/commits", response_model=list[schemas.CommitResponse])
def commits(request: Request) -> list[schemas.CommitResponse]:
    """Return ordered commit timeline."""
    return _dispatch_http(request, "commits", {})


@router.get("/metrics/timeseries", response_model=schemas.TimeseriesResponse)
def metrics_timeseries(
    request: Request,
    level: str = Query(..., pattern="^(module|file)$"),
    metric_id: str = Query(...),
    name: str | None = None,
    agg: str = Query("mean", pattern="^(mean|median|p95|max)$"),
) -> schemas.TimeseriesResponse:
    """Return complexity or size time series."""
    return _dispatch_http(
        request,
        "metrics/timeseries",
        {"level": level, "metric_id": metric_id, "name": name, "agg": agg},
    )


@router.get("/hotspots", response_model=schemas.HotspotsResponse)
def hotspots(
    request: Request,
    level: str = Query("module", pattern="^(module|file)$"),
    metric_id: str = Query("cyclomatic"),
    by: str = Query("value", pattern="^(value|growth)$"),
    limit: int = Query(20, ge=1, le=100),
    agg: str = Query("mean", pattern="^(mean|median|p95|max)$"),
) -> schemas.HotspotsResponse:
    """Return top-N hotspots."""
    return _dispatch_http(
        request,
        "hotspots",
        {"level": level, "metric_id": metric_id, "by": by, "limit": limit, "agg": agg},
    )


@router.get("/graph", response_model=schemas.GraphResponse)
def graph(
    request: Request,
    commit: str | None = None,
    include_zero_score: bool = False,
) -> schemas.GraphResponse:
    """Return graph nodes and edges at one commit."""
    return _dispatch_http(
        request, "graph", {"commit": commit, "include_zero_score": include_zero_score}
    )


@router.get("/ui/config", response_model=schemas.UiConfigResponse)
def ui_config(request: Request) -> schemas.UiConfigResponse:
    return _dispatch_http(request, "ui/config", {})


@router.get("/snapshot/table/modules", response_model=schemas.GenericTableResponse)
def snapshot_table_modules(
    request: Request,
    commit: str | None = None,
) -> schemas.GenericTableResponse:
    return _dispatch_http(request, "snapshot/table/modules", {"commit": commit})


@router.get("/snapshot/table/files", response_model=schemas.GenericTableResponse)
def snapshot_table_files(
    request: Request,
    commit: str | None = None,
    module: str | None = None,
) -> schemas.GenericTableResponse:
    return _dispatch_http(
        request, "snapshot/table/files", {"commit": commit, "module_name": module},
    )


@router.get("/snapshot/relations", response_model=schemas.RelationsResponse)
def snapshot_relations(
    request: Request,
    commit: str | None = None,
) -> schemas.RelationsResponse:
    return _dispatch_http(request, "snapshot/relations", {"commit": commit})


@router.get("/project/info", response_model=schemas.ProjectInfoResponse)
def project_info(request: Request) -> schemas.ProjectInfoResponse:
    return _dispatch_http(request, "project/info", {})
