"""Shared, FastAPI-free query dispatcher for the dashboard read surface.

Both ``ppi serve`` (HTTP) and ``ppi rpc`` (stdio JSON-RPC) route dashboard reads
through this module so behavior is identical (Spec FR-008/SC-003). The dispatcher
returns pydantic ``schemas`` model instances (or plain dicts/lists) so both
transports serialize the same JSON. HTTP-specific concerns (status codes,
opening the store, the writer-lock check) live in the callers; this module
raises ``QueryError`` for invalid input or missing data.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from ppi.query import schemas
from ppi.query._params import QueryError, _choice, _opt_bool, _opt_int, _opt_str, _req
from ppi.runtime.names import parse_module_file_path
from ppi.storage import schema
from ppi.storage.queries import QueryNotFoundError, StoreReader

MAX_EDGE_POINTS_BATCH_PAIRS = 500

DATA_METHODS = {
    "commits",
    "catalog",
    "metrics/timeseries",
    "hotspots",
    "structure/timeseries",
    "edges",
    "snapshot/modules",
    "snapshot/files",
    "snapshot/module",
    "snapshot/file",
    "graph",
    "edge-points",
    "edge-points/batch",
    "edge-evidence",
    "models",
    "depends",
    "failures",
    "edge-kinds/timeseries",
    "relations/diff",
}

ALL_METHODS = DATA_METHODS | {"status"}


MAX_EDGE_POINTS_BATCH_PAIRS = 500

DATA_METHODS = {
    "commits",
    "catalog",
    "metrics/timeseries",
    "hotspots",
    "structure/timeseries",
    "edges",
    "snapshot/modules",
    "snapshot/files",
    "snapshot/module",
    "snapshot/file",
    "graph",
    "edge-points",
    "edge-points/batch",
    "edge-evidence",
    "models",
    "depends",
    "failures",
    "edge-kinds/timeseries",
    "relations/diff",
}

ALL_METHODS = DATA_METHODS | {"status"}


def build_status(
    *,
    reader: StoreReader | None,
    store_present: bool,
    writer_active: bool,
    schema_error: schema.SchemaIncompatibleError | None = None,
) -> schemas.StatusResponse:
    """Build the status response (mirror of the HTTP ``/status`` endpoint)."""
    resolved_version = schema_error.stored if schema_error is not None else schema.SCHEMA_VERSION
    compatible = schema_error is None
    if reader is None:
        return schemas.StatusResponse(
            project_id=None,
            branch=None,
            schema_version=resolved_version,
            expected_schema_version=schema.SCHEMA_VERSION,
            schema_compatible=compatible,
            store_present=store_present,
            writer_active=writer_active,
            commit_count=0,
            last_run=None,
            run_failures=[],
        )
    project = reader.get_project()
    last_run = reader.last_run()
    run_failures: list[schemas.RunFailureResponse] = []
    if last_run and last_run["commits_failed"] > 0:
        run_failures = [
            schemas.RunFailureResponse(**row) for row in reader.failures_for_run(last_run["run_id"])
        ]
    scope = None
    if project is not None:
        scope = schemas.ScopeResponse(
            project_label=project.scope.project_label,
            module_prefixes=list(project.scope.module_prefixes),
            include_modules=list(project.scope.include_modules),
            all_modules=project.scope.all_modules,
            repo_path=project.repo_path,
        )
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
        run_failures=run_failures,
        scope=scope,
    )


def dispatch(
    reader: StoreReader | None,
    method: str,
    params: dict,
    *,
    writer_active: bool = False,
    store_present: bool = True,
    schema_error: schema.SchemaIncompatibleError | None = None,
) -> Any:
    """Resolve one dashboard read to its schema model(s) or raise ``QueryError``.

    Owns every method including ``status``. The caller opens the reader (or
    captures a schema error) and passes transport-specific context; this module
    centralizes method dispatch, the writer-lock check, and error normalization.
    """
    if method not in ALL_METHODS:
        raise QueryError("METHOD_NOT_FOUND", f"unknown method: {method}", http_status=404)
    if method == "status":
        return build_status(
            reader=reader,
            store_present=store_present,
            writer_active=writer_active,
            schema_error=schema_error,
        )
    if writer_active:
        raise QueryError("LOCKED", "analysis in progress", http_status=409)
    if schema_error is not None:
        raise QueryError(
            "SCHEMA_INCOMPATIBLE", str(schema_error), http_status=503
        ) from schema_error
    if reader is None:
        raise QueryError("STORE_NOT_FOUND", "store not found", http_status=503)
    try:
        return _METHOD_TABLE[method](reader, params)
    except QueryError:
        raise
    except QueryNotFoundError as exc:
        raise QueryError("QUERY_NOT_FOUND", str(exc), http_status=404) from exc
    except schema.SchemaIncompatibleError as exc:
        raise QueryError("SCHEMA_INCOMPATIBLE", str(exc), http_status=503) from exc
    except Exception as exc:  # noqa: BLE001
        raise QueryError("INTERNAL", str(exc), http_status=500) from exc


def _commits(reader: StoreReader, params: dict) -> list[schemas.CommitResponse]:
    return [schemas.CommitResponse(**row) for row in reader.commits()]


def _catalog(reader: StoreReader, params: dict) -> schemas.CatalogResponse:
    level = _choice(params, "level", {"module", "file"})
    limit = _opt_int(params, "limit", 5000)
    if level == "module":
        names = reader.list_module_names()
    else:
        names = reader.list_file_names(limit=limit)
    return schemas.CatalogResponse(level=level, names=names[:limit])


def _metrics_timeseries(reader: StoreReader, params: dict) -> schemas.TimeseriesResponse:
    level = _choice(params, "level", {"module", "file"})
    metric = _choice(
        params,
        "metric",
        {"cyclomatic", "cognitive", "jones", "lines", "lines_by_category", "python_file_count"},
    )
    name = _opt_str(params, "name")
    agg = _choice(params, "agg", {"mean", "median", "p95", "max"}, default="mean")
    if level == "module":
        if not name:
            raise QueryError("INVALID_PARAMS", "name is required for module level", http_status=422)
        if not reader.module_exists(name):
            raise QueryError("QUERY_NOT_FOUND", f"unknown module: {name}", http_status=404)
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
                        points=[schemas.TimeseriesPointResponse(**point) for point in points],
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
                    )
                ],
            )
        else:
            points = reader.module_complexity_timeseries(name, metric=metric, agg=agg)
        if not points:
            raise QueryError("QUERY_NOT_FOUND", f"unknown module: {name}", http_status=404)
        return schemas.TimeseriesResponse(
            level="module",
            metric=metric,
            agg=agg,
            series=[
                schemas.TimeseriesSeriesResponse(
                    name=name,
                    points=[schemas.TimeseriesPointResponse(**point) for point in points],
                )
            ],
        )
    if not name:
        raise QueryError("INVALID_PARAMS", "name is required for file level", http_status=422)
    try:
        module_name, relative_path = parse_module_file_path(name)
    except ValueError as exc:
        raise QueryError("INVALID_PARAMS", str(exc), http_status=422) from exc
    if not reader.file_exists(module_name, relative_path):
        raise QueryError("QUERY_NOT_FOUND", f"unknown file: {name}", http_status=404)
    if metric == "lines":
        points = reader.file_lines_timeseries(module_name, relative_path)
    else:
        points = reader.file_complexity_timeseries(
            module_name, relative_path, metric=metric, agg=agg
        )
    if not points:
        raise QueryError("QUERY_NOT_FOUND", f"unknown file: {name}", http_status=404)
    return schemas.TimeseriesResponse(
        level="file",
        metric=metric,
        agg=agg,
        series=[
            schemas.TimeseriesSeriesResponse(
                name=name,
                points=[schemas.TimeseriesPointResponse(**point) for point in points],
            )
        ],
    )


def _hotspots(reader: StoreReader, params: dict) -> schemas.HotspotsResponse:
    level = _choice(params, "level", {"module", "file"}, default="module")
    metric = _choice(
        params,
        "metric",
        {"cyclomatic", "cognitive", "jones", "python_file_count"},
        default="cyclomatic",
    )
    by = _choice(params, "by", {"value", "growth"}, default="value")
    limit = _opt_int(params, "limit", 20)
    agg = _choice(params, "agg", {"mean", "median", "p95", "max"}, default="mean")
    return schemas.HotspotsResponse(
        by=by,
        items=[
            schemas.HotspotItemResponse(**item)
            for item in reader.hotspots(level=level, metric=metric, by=by, limit=limit, agg=agg)
        ],
    )


def _structure_timeseries(reader: StoreReader, params: dict) -> schemas.StructureTimeseriesResponse:
    include_zero_score = _opt_bool(params, "include_zero_score", False)
    points = reader.coupling_structure_timeseries(include_zero_score=include_zero_score)
    return schemas.StructureTimeseriesResponse(
        points=[schemas.StructurePointResponse(**point) for point in points]
    )


def _edges(reader: StoreReader, params: dict) -> schemas.EdgesResponse:
    commit = _opt_str(params, "commit")
    min_score = _opt_int(params, "min_score", 0)
    include_zero_score = _opt_bool(params, "include_zero_score", False)
    if commit and not reader.commit_exists(commit):
        raise QueryError("QUERY_NOT_FOUND", f"unknown commit: {commit}", http_status=404)
    rows = reader.edges_at_commit(commit, include_zero_score=include_zero_score)
    resolved_commit = commit or reader.latest_edge_commit_hash() or reader.latest_commit_hash()
    if resolved_commit is None:
        return schemas.EdgesResponse(commit_hash=None, edges=[])
    threshold = min_score if include_zero_score else max(min_score, 1)
    filtered = [row for row in rows if row["score"] >= threshold]
    return schemas.EdgesResponse(
        commit_hash=resolved_commit, edges=[schemas.EdgeResponse(**row) for row in filtered]
    )


def _snapshot_modules(reader: StoreReader, params: dict) -> schemas.ModuleSnapshotResponse:
    return schemas.ModuleSnapshotResponse(**reader.modules_at_commit(_opt_str(params, "commit")))


def _snapshot_files(reader: StoreReader, params: dict) -> schemas.FileSnapshotResponse:
    return schemas.FileSnapshotResponse(
        **reader.files_at_commit(_opt_str(params, "commit"), _opt_str(params, "module"))
    )


def _snapshot_module(reader: StoreReader, params: dict) -> schemas.ModuleDetailResponse:
    return schemas.ModuleDetailResponse(
        **reader.module_detail(_req(params, "module"), _opt_str(params, "commit"))
    )


def _snapshot_file(reader: StoreReader, params: dict) -> schemas.FileDetailResponse:
    name = _req(params, "name")
    try:
        module_name, relative_path = parse_module_file_path(name)
    except ValueError as exc:
        raise QueryError("INVALID_PARAMS", str(exc), http_status=422) from exc
    payload = reader.file_detail(module_name, relative_path, _opt_str(params, "commit"))
    return schemas.FileDetailResponse(
        commit_hash=payload["commit_hash"], file=schemas.FileSnapshotItemResponse(**payload["file"])
    )


def _graph(reader: StoreReader, params: dict) -> schemas.GraphResponse:
    return schemas.GraphResponse(
        **reader.graph_at_commit(
            _opt_str(params, "commit"),
            include_zero_score=_opt_bool(params, "include_zero_score", False),
        )
    )


def _edge_points(reader: StoreReader, params: dict) -> schemas.EdgePointsResponse:
    return schemas.EdgePointsResponse(
        **reader.edge_points(
            _req(params, "source"),
            _req(params, "target"),
            _opt_str(params, "commit"),
            include_zero_score=_opt_bool(params, "include_zero_score", False),
        )
    )


def _edge_points_batch(reader: StoreReader, params: dict) -> schemas.EdgePointsBatchResponse:
    pairs_raw = params.get("pairs")
    if not isinstance(pairs_raw, list):
        raise QueryError("INVALID_PARAMS", "pairs is required", http_status=422)
    pairs: list[tuple[str, str]] = []
    for pair in pairs_raw:
        if not isinstance(pair, dict) or "source" not in pair or "target" not in pair:
            raise QueryError("INVALID_PARAMS", "each pair needs source and target", http_status=422)
        pairs.append((str(pair["source"]), str(pair["target"])))
    if len(pairs) > MAX_EDGE_POINTS_BATCH_PAIRS:
        raise QueryError(
            "INVALID_PARAMS",
            f"At most {MAX_EDGE_POINTS_BATCH_PAIRS} pairs per batch request",
            http_status=422,
        )
    payload = reader.edge_points_batch(
        pairs,
        _opt_str(params, "commit"),
        include_zero_score=_opt_bool(params, "include_zero_score", False),
    )
    return schemas.EdgePointsBatchResponse(
        commit_hash=payload["commit_hash"],
        edges=[schemas.EdgePointsResponse(**edge) for edge in payload["edges"]],
        missing=[schemas.EdgePointsMissingPairResponse(**row) for row in payload["missing"]],
    )


def _edge_evidence(reader: StoreReader, params: dict) -> schemas.EdgeEvidenceResponse:
    return schemas.EdgeEvidenceResponse(
        **reader.edge_evidence_for_pair(
            _req(params, "source"),
            _req(params, "target"),
            _opt_str(params, "commit"),
            include_zero_score=_opt_bool(params, "include_zero_score", False),
        )
    )


def _models(reader: StoreReader, params: dict) -> schemas.ModuleModelsResponse:
    return schemas.ModuleModelsResponse(
        **reader.module_models(_req(params, "module"), _opt_str(params, "commit"))
    )


def _depends(reader: StoreReader, params: dict) -> schemas.ManifestDependsResponse:
    return schemas.ManifestDependsResponse(
        **reader.manifest_depends(_opt_str(params, "module"), _opt_str(params, "commit"))
    )


def _failures(reader: StoreReader, params: dict) -> schemas.FailuresResponse:
    return schemas.FailuresResponse(**reader.failures_at_commit(_opt_str(params, "commit")))


def _edge_kind_timeseries(reader: StoreReader, params: dict) -> schemas.EdgeKindSeriesResponse:
    return schemas.EdgeKindSeriesResponse(
        points=[
            schemas.EdgeKindSeriesPointResponse(**row)
            for row in reader.edge_kind_timeseries(_opt_str(params, "kind"))
        ],
    )


def _relations_diff(reader: StoreReader, params: dict) -> schemas.RelationsDiffResponse:
    return schemas.RelationsDiffResponse(
        **reader.relations_diff(_req(params, "commit_a"), _req(params, "commit_b"))
    )


_METHOD_TABLE = {
    "commits": _commits,
    "catalog": _catalog,
    "metrics/timeseries": _metrics_timeseries,
    "hotspots": _hotspots,
    "structure/timeseries": _structure_timeseries,
    "edges": _edges,
    "snapshot/modules": _snapshot_modules,
    "snapshot/files": _snapshot_files,
    "snapshot/module": _snapshot_module,
    "snapshot/file": _snapshot_file,
    "graph": _graph,
    "edge-points": _edge_points,
    "edge-points/batch": _edge_points_batch,
    "edge-evidence": _edge_evidence,
    "models": _models,
    "depends": _depends,
    "failures": _failures,
    "edge-kinds/timeseries": _edge_kind_timeseries,
    "relations/diff": _relations_diff,
}
