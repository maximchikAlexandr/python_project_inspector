"""HTTP endpoints for the dashboard.

Thin FastAPI wrappers that validate parameters (OpenAPI) and delegate every read
to the shared ``ppi.query.dispatch`` so ``ppi serve`` and ``ppi rpc`` share one
implementation (Spec FR-008/SC-003). Only HTTP-specific concerns (request state,
response models, QueryError -> HTTPException mapping) live here.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query, Request

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


@router.get("/status", response_model=schemas.StatusResponse)
def status(request: Request) -> schemas.StatusResponse:
    """Return store and run status."""
    return _dispatch_http(request, "status", {})


@router.get("/commits", response_model=list[schemas.CommitResponse])
def commits(request: Request) -> list[schemas.CommitResponse]:
    """Return ordered commit timeline."""
    return _dispatch_http(request, "commits", {})


@router.get("/catalog", response_model=schemas.CatalogResponse)
def catalog(
    request: Request,
    level: str = Query(..., pattern="^(module|file)$"),
    limit: int = Query(5000, ge=1, le=10000),
) -> schemas.CatalogResponse:
    """Return selectable module or file names for dashboard filters."""
    return _dispatch_http(request, "catalog", {"level": level, "limit": limit})


@router.get("/metrics/timeseries", response_model=schemas.TimeseriesResponse)
def metrics_timeseries(
    request: Request,
    level: str = Query(..., pattern="^(module|file)$"),
    metric: str = Query(
        ..., pattern="^(cyclomatic|cognitive|jones|lines|lines_by_category|python_file_count)$"
    ),
    name: str | None = None,
    agg: str = Query("mean", pattern="^(mean|median|p95|max)$"),
) -> schemas.TimeseriesResponse:
    """Return complexity or size time series."""
    return _dispatch_http(
        request,
        "metrics/timeseries",
        {"level": level, "metric": metric, "name": name, "agg": agg},
    )


@router.get("/hotspots", response_model=schemas.HotspotsResponse)
def hotspots(
    request: Request,
    level: str = Query("module", pattern="^(module|file)$"),
    metric: str = Query("cyclomatic", pattern="^(cyclomatic|cognitive|jones|python_file_count)$"),
    by: str = Query("value", pattern="^(value|growth)$"),
    limit: int = Query(20, ge=1, le=100),
    agg: str = Query("mean", pattern="^(mean|median|p95|max)$"),
) -> schemas.HotspotsResponse:
    """Return top-N hotspots."""
    return _dispatch_http(
        request,
        "hotspots",
        {"level": level, "metric": metric, "by": by, "limit": limit, "agg": agg},
    )


@router.get("/structure/timeseries", response_model=schemas.StructureTimeseriesResponse)
def structure_timeseries(
    request: Request,
    include_zero_score: bool = False,
) -> schemas.StructureTimeseriesResponse:
    """Return coupling structure metrics over commit history."""
    return _dispatch_http(
        request, "structure/timeseries", {"include_zero_score": include_zero_score}
    )


@router.get("/edges", response_model=schemas.EdgesResponse)
def edges(
    request: Request,
    commit: str | None = None,
    min_score: int = Query(0, ge=0),
    include_zero_score: bool = False,
) -> schemas.EdgesResponse:
    """Return coupling edges for one commit."""
    return _dispatch_http(
        request,
        "edges",
        {"commit": commit, "min_score": min_score, "include_zero_score": include_zero_score},
    )


@router.get("/snapshot/modules", response_model=schemas.ModuleSnapshotResponse)
def snapshot_modules(
    request: Request,
    commit: str | None = None,
) -> schemas.ModuleSnapshotResponse:
    """Return module rows at one commit."""
    return _dispatch_http(request, "snapshot/modules", {"commit": commit})


@router.get("/snapshot/files", response_model=schemas.FileSnapshotResponse)
def snapshot_files(
    request: Request,
    commit: str | None = None,
    module: str | None = None,
) -> schemas.FileSnapshotResponse:
    """Return file rows at one commit."""
    return _dispatch_http(request, "snapshot/files", {"commit": commit, "module": module})


@router.get("/snapshot/module/{module_name}", response_model=schemas.ModuleDetailResponse)
def snapshot_module_detail(
    request: Request,
    module_name: str,
    commit: str | None = None,
) -> schemas.ModuleDetailResponse:
    """Return one module snapshot at a commit."""
    return _dispatch_http(request, "snapshot/module", {"module": module_name, "commit": commit})


@router.get("/snapshot/file", response_model=schemas.FileDetailResponse)
def snapshot_file_detail(
    request: Request,
    name: str = Query(...),
    commit: str | None = None,
) -> schemas.FileDetailResponse:
    """Return one file snapshot at a commit."""
    return _dispatch_http(request, "snapshot/file", {"name": name, "commit": commit})


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


@router.get("/edge-points", response_model=schemas.EdgePointsResponse)
def edge_points(
    request: Request,
    source: str = Query(...),
    target: str = Query(...),
    commit: str | None = None,
    include_zero_score: bool = False,
) -> schemas.EdgePointsResponse:
    """Return edge breakdown, points, and evidence."""
    return _dispatch_http(
        request,
        "edge-points",
        {
            "source": source,
            "target": target,
            "commit": commit,
            "include_zero_score": include_zero_score,
        },
    )


@router.post("/edge-points/batch", response_model=schemas.EdgePointsBatchResponse)
def edge_points_batch(
    request: Request,
    body: schemas.EdgePointsBatchRequest = Body(...),
) -> schemas.EdgePointsBatchResponse:
    """Return edge breakdown, points, and evidence for many pairs."""
    pairs = [{"source": pair.source, "target": pair.target} for pair in body.pairs]
    return _dispatch_http(
        request,
        "edge-points/batch",
        {"pairs": pairs, "commit": body.commit, "include_zero_score": body.include_zero_score},
    )


@router.get("/edge-evidence", response_model=schemas.EdgeEvidenceResponse)
def edge_evidence(
    request: Request,
    source: str = Query(...),
    target: str = Query(...),
    commit: str | None = None,
    include_zero_score: bool = False,
) -> schemas.EdgeEvidenceResponse:
    """Return evidence rows for one coupling edge."""
    return _dispatch_http(
        request,
        "edge-evidence",
        {
            "source": source,
            "target": target,
            "commit": commit,
            "include_zero_score": include_zero_score,
        },
    )


@router.get("/models", response_model=schemas.ModuleModelsResponse)
def module_models(
    request: Request,
    module: str = Query(...),
    commit: str | None = None,
) -> schemas.ModuleModelsResponse:
    """Return declared and inherited model names for one module."""
    return _dispatch_http(request, "models", {"module": module, "commit": commit})


@router.get("/depends", response_model=schemas.ManifestDependsResponse)
def manifest_depends(
    request: Request,
    module: str | None = None,
    commit: str | None = None,
) -> schemas.ManifestDependsResponse:
    """Return in-scope manifest dependencies at one commit."""
    return _dispatch_http(request, "depends", {"module": module, "commit": commit})


@router.get("/failures", response_model=schemas.FailuresResponse)
def failures(
    request: Request,
    commit: str | None = None,
) -> schemas.FailuresResponse:
    """Return analysis failures at one commit."""
    return _dispatch_http(request, "failures", {"commit": commit})


@router.get("/edge-kinds/timeseries", response_model=schemas.EdgeKindSeriesResponse)
def edge_kind_timeseries(
    request: Request,
    kind: str | None = None,
) -> schemas.EdgeKindSeriesResponse:
    """Return edge-kind counts over commit history."""
    return _dispatch_http(request, "edge-kinds/timeseries", {"kind": kind})


@router.get("/relations/diff", response_model=schemas.RelationsDiffResponse)
def relations_diff(
    request: Request,
    commit_a: str = Query(...),
    commit_b: str = Query(...),
) -> schemas.RelationsDiffResponse:
    """Return added and removed relations between two commits."""
    return _dispatch_http(request, "relations/diff", {"commit_a": commit_a, "commit_b": commit_b})
