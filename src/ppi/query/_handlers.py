"""Endpoint handlers for the shared query dispatcher.

Each handler maps one dashboard method to its ``StoreReader`` call(s) and
shapes the result into a ``schemas`` model. The dispatcher (``dispatch.py``)
owns the router table and calls these by method name.
"""

from __future__ import annotations

from ppi.query import schemas
from ppi.query._params import QueryError, _opt_bool, _opt_str, _req
from ppi.storage.queries import StoreReader


def commits(reader: StoreReader, params: dict) -> list[schemas.CommitResponse]:
    return [schemas.CommitResponse(**row) for row in reader.commits()]


def metrics_timeseries(reader: StoreReader, params: dict) -> schemas.TimeseriesResponse:
    level = _req(params, "level")
    metric_id = _req(params, "metric_id")
    agg = _req(params, "agg")
    name = _opt_str(params, "name")
    if level == "module":
        if not name:
            raise QueryError("INVALID_PARAMS", "name is required for module level", http_status=422)
        if not reader.module_exists(name):
            raise QueryError("QUERY_NOT_FOUND", f"unknown module: {name}", http_status=404)
        points = (
            reader.module_lines_timeseries(name)
            if metric_id == "lines"
            else reader.module_complexity_timeseries(name, metric=metric_id, agg=agg)
        )
    else:
        if not name:
            raise QueryError("INVALID_PARAMS", "name is required for file level", http_status=422)
        module_name, _, relative_path = name.partition("/")
        if not module_name or not relative_path:
            raise QueryError("INVALID_PARAMS", "file name must be module/relative/path", http_status=422)
        if not reader.file_exists(module_name, relative_path):
            raise QueryError("QUERY_NOT_FOUND", f"unknown file: {name}", http_status=404)
        points = (
            reader.file_lines_timeseries(module_name, relative_path)
            if metric_id == "lines"
            else reader.file_complexity_timeseries(
                module_name, relative_path, metric=metric_id, agg=agg,
            )
        )
    if not points:
        raise QueryError("QUERY_NOT_FOUND", f"unknown {level}: {name}", http_status=404)
    return schemas.TimeseriesResponse(
        level=level,
        metric_id=metric_id,
        agg=agg,
        series=[
            schemas.TimeseriesSeriesResponse(
                name=name,
                points=[schemas.TimeseriesPointResponse(**point) for point in points],
            )
        ],
    )


def hotspots(reader: StoreReader, params: dict) -> schemas.HotspotsResponse:
    metric_id = _req(params, "metric_id")
    by = _req(params, "by")
    level = _req(params, "level")
    agg = _req(params, "agg")
    limit = int(params.get("limit", 20))
    return schemas.HotspotsResponse(
        by=by,
        items=[
            schemas.HotspotItemResponse(**item)
            for item in reader.hotspots(
                level=level, metric=metric_id, by=by, limit=limit, agg=agg,
            )
        ],
    )


def graph(reader: StoreReader, params: dict) -> schemas.GraphResponse:
    return schemas.GraphResponse(
        **reader.graph_at_commit(
            _opt_str(params, "commit"),
            include_zero_score=_opt_bool(params, "include_zero_score", False),
        )
    )


def ui_config(reader: StoreReader, params: dict) -> schemas.UiConfigResponse:
    return schemas.UiConfigResponse(
        dashboard_metrics=[
            schemas.UiMetricOption(id="cyclomatic_mean", label="Cyclomatic Mean", unit="", format=".1f", default_enabled=True),
            schemas.UiMetricOption(id="cognitive_mean", label="Cognitive Mean", unit="", format=".1f", default_enabled=True),
            schemas.UiMetricOption(id="jones_mean", label="Jones Mean", unit="", format=".1f", default_enabled=True),
            schemas.UiMetricOption(id="python_file_count", label="Python Files", unit="", format="d", default_enabled=False),
        ],
        aggregations=[
            schemas.UiOption(id="mean", label="Mean", default_enabled=True),
            schemas.UiOption(id="median", label="Median", default_enabled=True),
            schemas.UiOption(id="p95", label="P95", default_enabled=False),
            schemas.UiOption(id="max", label="Max", default_enabled=False),
        ],
        tables=[
            schemas.UiTableDefinition(key="modules", label="Modules", columns=[
                schemas.UiColumnDefinition(key="module_name", label="Module", type="string"),
                schemas.UiColumnDefinition(key="total_lines", label="Lines", type="number"),
            ]),
            schemas.UiTableDefinition(key="files", label="Files", columns=[
                schemas.UiColumnDefinition(key="relative_path", label="File", type="string"),
                schemas.UiColumnDefinition(key="line_category_id", label="Category", type="string"),
            ]),
            schemas.UiTableDefinition(key="relations", label="Relations", columns=[
                schemas.UiColumnDefinition(key="source_id", label="Source", type="string"),
                schemas.UiColumnDefinition(key="relation_type_id", label="Type", type="string"),
                schemas.UiColumnDefinition(key="target_id", label="Target", type="string"),
            ]),
        ],
        graph=schemas.UiGraphConfig(
            edge_types=[],
            line_categories=[schemas.UiOption(id="python_lines", label="Python", default_enabled=True)],
            brightness_metrics=[schemas.UiMetricOption(id="cyclomatic_mean", label="Cyclomatic", format=".1f", default_enabled=True)],
            node_size_metrics=[schemas.UiMetricOption(id="total_lines", label="Lines", format="d", default_enabled=True)],
            link_thickness_metrics=[schemas.UiMetricOption(id="score", label="Score", format="d", default_enabled=True)],
        ),
    )


def snapshot_table_modules(reader: StoreReader, params: dict) -> schemas.GenericTableResponse:
    commit = _opt_str(params, "commit")
    rows = reader.snapshot_table_modules(commit_hash=commit)
    resolved = commit or reader.latest_commit_hash()
    return schemas.GenericTableResponse(
        commit_hash=resolved or "",
        rows=[schemas.GenericTableRow(cells=row) for row in rows],
    )


def snapshot_table_files(reader: StoreReader, params: dict) -> schemas.GenericTableResponse:
    commit = _opt_str(params, "commit")
    module_name = _opt_str(params, "module_name")
    rows = reader.snapshot_table_files(commit_hash=commit, module_name=module_name)
    resolved = commit or reader.latest_commit_hash()
    return schemas.GenericTableResponse(
        commit_hash=resolved or "",
        rows=[schemas.GenericTableRow(cells=row) for row in rows],
    )


def snapshot_relations(reader: StoreReader, params: dict) -> schemas.RelationsResponse:
    commit = _opt_str(params, "commit")
    include_zero_score = _opt_bool(params, "include_zero_score", False)
    resolved = reader._resolve_commit(commit)
    rows = reader.snapshot_relations(
        commit_hash=resolved,
        include_zero_score=include_zero_score,
    )
    return schemas.RelationsResponse(
        commit_hash=resolved,
        relations=[schemas.RelationRowResponse(**row) for row in rows],
    )


def project_info(reader: StoreReader, params: dict) -> schemas.ProjectInfoResponse:
    info = reader.project_info()
    return schemas.ProjectInfoResponse(
        project_id=info["project_id"],
        branch=info["branch"],
        commit_count=info["commit_count"],
        schema_version=reader.schema_version(),
        store_present=True,
    )
