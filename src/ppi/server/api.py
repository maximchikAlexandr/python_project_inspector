"""HTTP endpoints for the dashboard."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query, Request

from ppi.runtime import lock as project_lock
from ppi.runtime.names import parse_module_file_path
from ppi.server import schemas
from ppi.storage import schema
from ppi.storage.queries import QueryNotFoundError, StoreReader

router = APIRouter()

MAX_EDGE_POINTS_BATCH_PAIRS = 500


def _parse_file_name(name: str) -> tuple[str, str]:
    """Split a file series name into module and relative path."""
    return parse_module_file_path(name)


def _status_model(
    *,
    store_present: bool,
    writer_active: bool,
    reader: StoreReader | None = None,
    schema_version: int | None = None,
    schema_compatible: bool = True,
) -> schemas.StatusResponse:
    """Build a status response matching the HTTP contract."""
    resolved_version = schema_version if schema_version is not None else schema.SCHEMA_VERSION
    if reader is None:
        return schemas.StatusResponse(
            project_id=None,
            branch=None,
            schema_version=resolved_version,
            expected_schema_version=schema.SCHEMA_VERSION,
            schema_compatible=schema_compatible,
            store_present=store_present,
            writer_active=writer_active,
            commit_count=0,
            last_run=None,
        )
    project = reader.get_project()
    last_run = reader.last_run()
    return schemas.StatusResponse(
        project_id=project.project_id if project is not None else None,
        branch=project.branch if project is not None else None,
        schema_version=reader.schema_version(),
        expected_schema_version=schema.SCHEMA_VERSION,
        schema_compatible=True,
        store_present=store_present,
        writer_active=writer_active,
        commit_count=reader.commit_count(),
        last_run=schemas.LastRunResponse(**last_run) if last_run else None,
    )


def _open_reader_or_schema_error(
    request: Request,
) -> tuple[StoreReader | None, schema.SchemaIncompatibleError | None]:
    """Open a read-only store reader or capture schema incompatibility."""
    store_file = request.app.state.store_file
    if not store_file.is_file():
        raise HTTPException(status_code=503, detail="store not found")
    try:
        return StoreReader(store_file, read_only=True), None
    except schema.SchemaIncompatibleError as exc:
        return None, exc


def _open_reader(request: Request) -> StoreReader:
    """Open a read-only store reader."""
    try:
        return StoreReader(request.app.state.store_file, read_only=True)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="store not found") from exc
    except schema.SchemaIncompatibleError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _reader(request: Request) -> StoreReader:
    """Open a read-only store reader when no writer holds the lock."""
    if project_lock.is_locked(request.app.state.lock_file):
        raise HTTPException(status_code=409, detail="analysis in progress")
    return _open_reader(request)


def _query_not_found(exc: QueryNotFoundError) -> HTTPException:
    """Map store query lookup failures to HTTP 404."""
    return HTTPException(status_code=404, detail=str(exc))


@router.get("/status", response_model=schemas.StatusResponse)
def status(request: Request) -> schemas.StatusResponse:
    """Return store and run status."""
    locked = project_lock.is_locked(request.app.state.lock_file)
    store_file = request.app.state.store_file
    if not store_file.is_file():
        return _status_model(store_present=False, writer_active=locked)
    reader, schema_error = _open_reader_or_schema_error(request)
    if schema_error is not None:
        return _status_model(
            store_present=True,
            writer_active=locked,
            schema_version=schema_error.stored,
            schema_compatible=False,
        )
    try:
        return _status_model(store_present=True, writer_active=locked, reader=reader)
    finally:
        reader.close()


@router.get("/commits", response_model=list[schemas.CommitResponse])
def commits(request: Request) -> list[schemas.CommitResponse]:
    """Return ordered commit timeline."""
    reader = _reader(request)
    try:
        return [schemas.CommitResponse(**row) for row in reader.commits()]
    finally:
        reader.close()


@router.get("/catalog", response_model=schemas.CatalogResponse)
def catalog(
    request: Request,
    level: str = Query(..., pattern="^(module|file)$"),
    limit: int = Query(5000, ge=1, le=10000),
) -> schemas.CatalogResponse:
    """Return selectable module or file names for dashboard filters."""
    reader = _reader(request)
    try:
        if level == "module":
            names = reader.list_module_names()
        else:
            names = reader.list_file_names(limit=limit)
        return schemas.CatalogResponse(level=level, names=names[:limit])
    finally:
        reader.close()


@router.get("/metrics/timeseries", response_model=schemas.TimeseriesResponse)
def metrics_timeseries(
    request: Request,
    level: str = Query(..., pattern="^(module|file)$"),
    metric: str = Query(..., pattern="^(cyclomatic|cognitive|jones|lines|lines_by_category|python_file_count)$"),
    name: str | None = None,
    agg: str = Query("mean", pattern="^(mean|median|p95|max)$"),
) -> schemas.TimeseriesResponse:
    """Return complexity or size time series."""
    reader = _reader(request)
    try:
        if level == "module":
            if not name:
                raise HTTPException(status_code=422, detail="name query parameter is required for module level")
            if not reader.module_exists(name):
                raise HTTPException(status_code=404, detail=f"unknown module: {name}")
            if metric == "lines":
                points = reader.module_lines_timeseries(name)
            elif metric == "lines_by_category":
                rows = reader.module_lines_by_category_timeseries(name)
                by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
                for row in rows:
                    by_category[row["category"]].append(
                        {
                            "commit_order": row["commit_order"],
                            "commit_hash": row["commit_hash"],
                            "value": row["value"],
                        },
                    )
                return schemas.TimeseriesResponse(
                    level="module",
                    metric=metric,
                    agg=agg,
                    series=[
                        schemas.TimeseriesSeriesResponse(
                            name=f"{name}/{category}",
                            points=[
                                schemas.TimeseriesPointResponse(**point)
                                for point in points
                            ],
                        )
                        for category, points in sorted(by_category.items())
                    ],
                )
            elif metric == "python_file_count":
                points = reader.python_file_count_timeseries(name)
                return schemas.TimeseriesResponse(
                    level="module",
                    metric=metric,
                    agg=agg,
                    series=[
                        schemas.TimeseriesSeriesResponse(
                            name=name,
                            points=[schemas.TimeseriesPointResponse(**point) for point in points],
                        ),
                    ],
                )
            else:
                points = reader.module_complexity_timeseries(
                    name,
                    metric=metric,
                    agg=agg,
                )
            if not points:
                raise HTTPException(status_code=404, detail=f"unknown module: {name}")
            return schemas.TimeseriesResponse(
                level="module",
                metric=metric,
                agg=agg,
                series=[
                    schemas.TimeseriesSeriesResponse(
                        name=name,
                        points=[schemas.TimeseriesPointResponse(**point) for point in points],
                    ),
                ],
            )
        if not name:
            raise HTTPException(status_code=422, detail="name query parameter is required for file level")
        try:
            module_name, relative_path = _parse_file_name(name)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if not reader.file_exists(module_name, relative_path):
            raise HTTPException(status_code=404, detail=f"unknown file: {name}")
        if metric == "lines":
            points = reader.file_lines_timeseries(module_name, relative_path)
        else:
            points = reader.file_complexity_timeseries(
                module_name,
                relative_path,
                metric=metric,
                agg=agg,
            )
        if not points:
            raise HTTPException(status_code=404, detail=f"unknown file: {name}")
        return schemas.TimeseriesResponse(
            level="file",
            metric=metric,
            agg=agg,
            series=[
                schemas.TimeseriesSeriesResponse(
                    name=name,
                    points=[schemas.TimeseriesPointResponse(**point) for point in points],
                ),
            ],
        )
    finally:
        reader.close()


@router.get("/hotspots", response_model=schemas.HotspotsResponse)
def hotspots(
    request: Request,
    level: str = Query("module", pattern="^(module|file)$"),
    metric: str = Query("cyclomatic", pattern="^(cyclomatic|cognitive|jones)$"),
    by: str = Query("value", pattern="^(value|growth)$"),
    limit: int = Query(20, ge=1, le=100),
    agg: str = Query("mean", pattern="^(mean|median|p95|max)$"),
) -> schemas.HotspotsResponse:
    """Return top-N hotspots."""
    reader = _reader(request)
    try:
        return schemas.HotspotsResponse(
            by=by,
            items=[schemas.HotspotItemResponse(**item) for item in reader.hotspots(
                level=level,
                metric=metric,
                by=by,
                limit=limit,
                agg=agg,
            )],
        )
    finally:
        reader.close()


@router.get("/structure/timeseries", response_model=schemas.StructureTimeseriesResponse)
def structure_timeseries(
    request: Request,
    include_zero_score: bool = False,
) -> schemas.StructureTimeseriesResponse:
    """Return coupling structure metrics over commit history."""
    reader = _reader(request)
    try:
        points = reader.coupling_structure_timeseries(include_zero_score=include_zero_score)
        return schemas.StructureTimeseriesResponse(
            points=[schemas.StructurePointResponse(**point) for point in points],
        )
    finally:
        reader.close()


@router.get("/edges", response_model=schemas.EdgesResponse)
def edges(
    request: Request,
    commit: str | None = None,
    min_score: int = Query(0, ge=0),
    include_zero_score: bool = False,
) -> schemas.EdgesResponse:
    """Return coupling edges for one commit."""
    reader = _reader(request)
    try:
        if commit and not reader.commit_exists(commit):
            raise HTTPException(status_code=404, detail=f"unknown commit: {commit}")
        rows = reader.edges_at_commit(commit, include_zero_score=include_zero_score)
        resolved_commit = commit or reader.latest_edge_commit_hash() or reader.latest_commit_hash()
        if resolved_commit is None:
            return schemas.EdgesResponse(commit_hash=None, edges=[])
        threshold = min_score if include_zero_score else max(min_score, 1)
        filtered = [row for row in rows if row["score"] >= threshold]
        return schemas.EdgesResponse(
            commit_hash=resolved_commit,
            edges=[schemas.EdgeResponse(**row) for row in filtered],
        )
    finally:
        reader.close()


@router.get("/snapshot/modules", response_model=schemas.ModuleSnapshotResponse)
def snapshot_modules(
    request: Request,
    commit: str | None = None,
) -> schemas.ModuleSnapshotResponse:
    """Return module rows at one commit."""
    reader = _reader(request)
    try:
        payload = reader.modules_at_commit(commit)
        return schemas.ModuleSnapshotResponse(**payload)
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.get("/snapshot/files", response_model=schemas.FileSnapshotResponse)
def snapshot_files(
    request: Request,
    commit: str | None = None,
    module: str | None = None,
) -> schemas.FileSnapshotResponse:
    """Return file rows at one commit."""
    reader = _reader(request)
    try:
        payload = reader.files_at_commit(commit, module)
        return schemas.FileSnapshotResponse(**payload)
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.get("/snapshot/module/{module_name}", response_model=schemas.ModuleDetailResponse)
def snapshot_module_detail(
    request: Request,
    module_name: str,
    commit: str | None = None,
) -> schemas.ModuleDetailResponse:
    """Return one module snapshot at a commit."""
    reader = _reader(request)
    try:
        return schemas.ModuleDetailResponse(**reader.module_detail(module_name, commit))
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.get("/snapshot/file", response_model=schemas.FileDetailResponse)
def snapshot_file_detail(
    request: Request,
    name: str = Query(...),
    commit: str | None = None,
) -> schemas.FileDetailResponse:
    """Return one file snapshot at a commit."""
    reader = _reader(request)
    try:
        module_name, relative_path = _parse_file_name(name)
        payload = reader.file_detail(module_name, relative_path, commit)
        return schemas.FileDetailResponse(
            commit_hash=payload["commit_hash"],
            file=schemas.FileSnapshotItemResponse(**payload["file"]),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.get("/graph", response_model=schemas.GraphResponse)
def graph(
    request: Request,
    commit: str | None = None,
    include_zero_score: bool = False,
) -> schemas.GraphResponse:
    """Return graph nodes and edges at one commit."""
    reader = _reader(request)
    try:
        return schemas.GraphResponse(**reader.graph_at_commit(commit, include_zero_score=include_zero_score))
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.get("/edge-points", response_model=schemas.EdgePointsResponse)
def edge_points(
    request: Request,
    source: str = Query(...),
    target: str = Query(...),
    commit: str | None = None,
    include_zero_score: bool = False,
) -> schemas.EdgePointsResponse:
    """Return edge breakdown, points, and evidence."""
    reader = _reader(request)
    try:
        return schemas.EdgePointsResponse(**reader.edge_points(
            source,
            target,
            commit,
            include_zero_score=include_zero_score,
        ))
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.post("/edge-points/batch", response_model=schemas.EdgePointsBatchResponse)
def edge_points_batch(
    request: Request,
    body: schemas.EdgePointsBatchRequest = Body(...),
) -> schemas.EdgePointsBatchResponse:
    """Return edge breakdown, points, and evidence for many pairs."""
    if len(body.pairs) > MAX_EDGE_POINTS_BATCH_PAIRS:
        raise HTTPException(
            status_code=422,
            detail=f"At most {MAX_EDGE_POINTS_BATCH_PAIRS} pairs per batch request",
        )
    reader = _reader(request)
    try:
        payload = reader.edge_points_batch(
            [(pair.source, pair.target) for pair in body.pairs],
            body.commit,
            include_zero_score=body.include_zero_score,
        )
        return schemas.EdgePointsBatchResponse(
            commit_hash=payload["commit_hash"],
            edges=[schemas.EdgePointsResponse(**edge) for edge in payload["edges"]],
            missing=[schemas.EdgePointsMissingPairResponse(**row) for row in payload["missing"]],
        )
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.get("/edge-evidence", response_model=schemas.EdgeEvidenceResponse)
def edge_evidence(
    request: Request,
    source: str = Query(...),
    target: str = Query(...),
    commit: str | None = None,
    include_zero_score: bool = False,
) -> schemas.EdgeEvidenceResponse:
    """Return evidence rows for one coupling edge."""
    reader = _reader(request)
    try:
        return schemas.EdgeEvidenceResponse(**reader.edge_evidence_for_pair(
            source,
            target,
            commit,
            include_zero_score=include_zero_score,
        ))
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.get("/models", response_model=schemas.ModuleModelsResponse)
def module_models(
    request: Request,
    module: str = Query(...),
    commit: str | None = None,
) -> schemas.ModuleModelsResponse:
    """Return declared and inherited model names for one module."""
    reader = _reader(request)
    try:
        return schemas.ModuleModelsResponse(**reader.module_models(module, commit))
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.get("/depends", response_model=schemas.ManifestDependsResponse)
def manifest_depends(
    request: Request,
    module: str | None = None,
    commit: str | None = None,
) -> schemas.ManifestDependsResponse:
    """Return in-scope manifest dependencies at one commit."""
    reader = _reader(request)
    try:
        return schemas.ManifestDependsResponse(**reader.manifest_depends(module, commit))
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.get("/failures", response_model=schemas.FailuresResponse)
def failures(
    request: Request,
    commit: str | None = None,
) -> schemas.FailuresResponse:
    """Return analysis failures at one commit."""
    reader = _reader(request)
    try:
        return schemas.FailuresResponse(**reader.failures_at_commit(commit))
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()


@router.get("/edge-kinds/timeseries", response_model=schemas.EdgeKindSeriesResponse)
def edge_kind_timeseries(
    request: Request,
    kind: str | None = None,
) -> schemas.EdgeKindSeriesResponse:
    """Return edge-kind counts over commit history."""
    reader = _reader(request)
    try:
        return schemas.EdgeKindSeriesResponse(
            points=[schemas.EdgeKindSeriesPointResponse(**row) for row in reader.edge_kind_timeseries(kind)],
        )
    finally:
        reader.close()


@router.get("/relations/diff", response_model=schemas.RelationsDiffResponse)
def relations_diff(
    request: Request,
    commit_a: str = Query(...),
    commit_b: str = Query(...),
) -> schemas.RelationsDiffResponse:
    """Return added and removed relations between two commits."""
    reader = _reader(request)
    try:
        return schemas.RelationsDiffResponse(**reader.relations_diff(commit_a, commit_b))
    except QueryNotFoundError as exc:
        raise _query_not_found(exc) from exc
    finally:
        reader.close()
