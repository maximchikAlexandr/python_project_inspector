"""Transport-neutral API response schemas shared by the FastAPI server and the stdio RPC servant."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class CommitResponse(BaseModel):
    commit_hash: str
    commit_order: int
    authored_at: Any | None
    summary: str | None


class TimeseriesPointResponse(BaseModel):
    commit_order: int
    commit_hash: str
    value: float | int | None


class TimeseriesSeriesResponse(BaseModel):
    name: str
    points: list[TimeseriesPointResponse]


class TimeseriesResponse(BaseModel):
    level: Literal["module", "file"]
    metric_id: str
    agg: str
    series: list[TimeseriesSeriesResponse]


class HotspotItemResponse(BaseModel):
    name: str
    current: float
    first: float | None = None
    growth: float | None = None


class HotspotsResponse(BaseModel):
    by: Literal["value", "growth"]
    items: list[HotspotItemResponse]


class EdgeResponse(BaseModel):
    source: str
    target: str
    score: int
    kinds: dict[str, int]
    kind_occurrence_count: int = 0
    breakdown: dict[str, int] | None = None
    commit_hash: str


class GraphNodeResponse(BaseModel):
    module_name: str
    total_lines: int
    metrics: dict[str, float]
    line_counts: dict[str, int]
    line_categories: dict[str, int]


class GraphResponse(BaseModel):
    commit_hash: str
    nodes: list[GraphNodeResponse]
    edges: list[EdgeResponse]


class UiOption(BaseModel):
    id: str
    label: str
    default_enabled: bool = False


class UiMetricOption(BaseModel):
    id: str
    label: str
    unit: str = ""
    format: str = ""
    default_enabled: bool = False


class UiColumnDefinition(BaseModel):
    key: str
    label: str
    type: str = "string"
    metric_id: str | None = None
    width: int | None = None


class UiTableDefinition(BaseModel):
    key: str
    label: str
    columns: list[UiColumnDefinition]


class UiGraphConfig(BaseModel):
    edge_types: list[UiOption]
    line_categories: list[UiOption]
    brightness_metrics: list[UiMetricOption]
    node_size_metrics: list[UiMetricOption]
    link_thickness_metrics: list[UiMetricOption]


class UiConfigResponse(BaseModel):
    dashboard_metrics: list[UiMetricOption]
    aggregations: list[UiOption]
    tables: list[UiTableDefinition]
    graph: UiGraphConfig


class GenericTableRow(BaseModel):
    cells: dict[str, Any]


class GenericTableResponse(BaseModel):
    commit_hash: str
    rows: list[GenericTableRow]


class RelationRowResponse(BaseModel):
    source_id: str
    source_label: str
    target_id: str
    target_label: str
    relation_type_id: str
    relation_type_label: str
    strength_metric_id: str = ""
    strength_metric_label: str = ""
    strength_value: float = 0


class RelationsResponse(BaseModel):
    commit_hash: str
    relations: list[RelationRowResponse]


class ProjectInfoResponse(BaseModel):
    project_id: str | None
    branch: str | None
    commit_count: int
    schema_version: int
    store_present: bool
