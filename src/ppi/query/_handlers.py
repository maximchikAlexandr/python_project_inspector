"""Endpoint handlers for the shared query dispatcher.

Each handler maps one dashboard method to its ``StoreReader`` call(s) and
shapes the result into a ``schemas`` model. The dispatcher (``dispatch.py``)
owns the router table and calls these by method name.
"""

from __future__ import annotations

from ppi.query import metric_catalog, schemas
from ppi.query._params import QueryError, _opt_bool, _opt_str, _req
from ppi.storage.queries import StoreReader


def commits(reader: StoreReader, params: dict) -> list[schemas.CommitResponse]:
    return [schemas.CommitResponse(**row) for row in reader.commits()]


def metrics_timeseries(reader: StoreReader, params: dict) -> schemas.TimeseriesResponse:
    level = _req(params, "level")
    metric_id = metric_catalog.validate_metric_id(_req(params, "metric_id"), level=level)
    agg = _req(params, "agg")
    name = _opt_str(params, "name")
    if not name:
        raise QueryError("INVALID_PARAMS", "name is required for {level} level".format(level=level), http_status=422)
    method_name = metric_catalog.reader_method_for(metric_id, level)
    points = _invoke_reader(reader, method_name, level, name)
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


def _invoke_reader(reader: StoreReader, method_name: str, level: str, name: str) -> list:
    """Dispatch to the right reader method for a (level, name) pair.

    `name` is a module name at module level, or `module/relative_path` at file level.
    """
    method = getattr(reader, method_name)
    if level == "module":
        return method(name)
    module_name, _, relative_path = name.partition("/")
    if not module_name or not relative_path:
        raise QueryError("INVALID_PARAMS", "file name must be module/relative/path", http_status=422)
    if not reader.file_exists(module_name, relative_path):
        raise QueryError("QUERY_NOT_FOUND", f"unknown file: {name}", http_status=404)
    return method(module_name, relative_path)


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


def _ui_option(o: metric_catalog.Option) -> schemas.UiOption:
    return schemas.UiOption(id=o.id, label=o.label, default_enabled=o.default_enabled)


def _ui_metric_option_from_metric(m: metric_catalog.MetricDefinition) -> schemas.UiMetricOption:
    return schemas.UiMetricOption(
        id=m.metric_id,
        label=m.label,
        unit=m.unit or "",
        format=m.format or "",
        default_enabled=m.default_enabled,
    )


def _ui_metric_option_from_graph(o: metric_catalog.GraphViewOption) -> schemas.UiMetricOption:
    return schemas.UiMetricOption(
        id=o.id, label=o.label, format="d", default_enabled=o.default_enabled,
    )


def ui_config(reader: StoreReader, params: dict) -> schemas.UiConfigResponse:
    catalog_metrics = [_ui_metric_option_from_metric(m) for m in metric_catalog.all_metrics()]
    return schemas.UiConfigResponse(
        dashboard_metrics=catalog_metrics,
        aggregations=[_ui_option(a) for a in metric_catalog.aggregations()],
        tables=_TABLE_DEFINITIONS,
        graph=schemas.UiGraphConfig(
            edge_types=[_ui_option(r) for r in metric_catalog.relation_types()],
            line_categories=[_ui_option(l) for l in metric_catalog.line_categories()],
            brightness_metrics=catalog_metrics,
            node_size_metrics=[
                _ui_metric_option_from_graph(o) for o in metric_catalog.node_size_options()
            ],
            link_thickness_metrics=[
                _ui_metric_option_from_graph(o) for o in metric_catalog.link_thickness_options()
            ],
        ),
    )


_TABLE_DEFINITIONS: tuple[schemas.UiTableDefinition, ...] = (
    schemas.UiTableDefinition(key="modules", label="Modules", columns=(
        schemas.UiColumnDefinition(key="module_name", label="Module", type="string"),
        schemas.UiColumnDefinition(key="total_lines", label="Lines", type="number"),
        schemas.UiColumnDefinition(key="line_counts", label="Line counts", type="json"),
    )),
    schemas.UiTableDefinition(key="files", label="Files", columns=(
        schemas.UiColumnDefinition(key="relative_path", label="File", type="string"),
        schemas.UiColumnDefinition(key="total_lines", label="Lines", type="number"),
    )),
    schemas.UiTableDefinition(key="relations", label="Relations", columns=(
        schemas.UiColumnDefinition(key="source_id", label="Source", type="string"),
        schemas.UiColumnDefinition(key="relation_type_id", label="Type", type="string"),
        schemas.UiColumnDefinition(key="relation_type_label", label="Type label", type="string"),
        schemas.UiColumnDefinition(key="target_id", label="Target", type="string"),
        schemas.UiColumnDefinition(key="strength_metric_label", label="Strength", type="string"),
        schemas.UiColumnDefinition(key="strength_value", label="Strength value", type="number"),
    )),
)


def snapshot_table_modules(reader: StoreReader, params: dict) -> schemas.GenericTableResponse:
    commit = _opt_str(params, "commit")
    rows = reader.snapshot_table_modules(commit_hash=commit)
    resolved = commit or reader.latest_commit_hash()
    return schemas.GenericTableResponse(
        commit_hash=resolved or "",
        rows=[
            schemas.GenericTableRow(
                id=str(row.get("module_name", "")), cells=row, actions={"drilldown": True},
            )
            for row in rows
        ],
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
