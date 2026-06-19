"""HTTP endpoints for the dashboard."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from python_project_inspector.runtime.names import parse_module_file_path
from python_project_inspector.runtime import lock as project_lock
from python_project_inspector.server import schemas
from python_project_inspector.storage import schema
from python_project_inspector.storage.queries import StoreReader

router = APIRouter()


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
    metric: str = Query(..., pattern="^(cyclomatic|cognitive|jones|lines)$"),
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
            )],
        )
    finally:
        reader.close()


@router.get("/structure/timeseries", response_model=schemas.StructureTimeseriesResponse)
def structure_timeseries(request: Request) -> schemas.StructureTimeseriesResponse:
    """Return coupling structure metrics over commit history."""
    reader = _reader(request)
    try:
        points = reader.coupling_structure_timeseries()
        return schemas.StructureTimeseriesResponse(
            points=[schemas.StructurePointResponse(**point) for point in points],
        )
    finally:
        reader.close()


@router.get("/edges", response_model=schemas.EdgesResponse)
def edges(
    request: Request,
    commit: str | None = None,
    min_score: int = Query(1, ge=0),
) -> schemas.EdgesResponse:
    """Return coupling edges for one commit."""
    reader = _reader(request)
    try:
        if commit and not reader.commit_exists(commit):
            raise HTTPException(status_code=404, detail=f"unknown commit: {commit}")
        rows = reader.edges_at_commit(commit)
        resolved_commit = commit or reader.latest_edge_commit_hash() or reader.latest_commit_hash()
        if resolved_commit is None:
            return schemas.EdgesResponse(commit_hash=None, edges=[])
        filtered = [row for row in rows if row["score"] >= min_score]
        return schemas.EdgesResponse(
            commit_hash=resolved_commit,
            edges=[schemas.EdgeResponse(**row) for row in filtered],
        )
    finally:
        reader.close()
