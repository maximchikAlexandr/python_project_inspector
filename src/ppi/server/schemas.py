"""Pydantic response models for the FastAPI boundary."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class LastRunResponse(BaseModel):
    """Metadata for the most recent analysis run."""

    run_id: str
    branch: str
    mode: str
    status: str
    started_at: Any
    finished_at: Any | None
    commits_total: int
    commits_succeeded: int
    commits_failed: int


class StatusResponse(BaseModel):
    """Store and run status for the dashboard."""

    project_id: str | None
    branch: str | None
    schema_version: int
    expected_schema_version: int = Field(description="Schema version required by this package.")
    schema_compatible: bool = True
    store_present: bool
    writer_active: bool
    commit_count: int
    last_run: LastRunResponse | None


class CommitResponse(BaseModel):
    """One commit in the ordered timeline."""

    commit_hash: str
    commit_order: int
    authored_at: Any | None
    summary: str | None


class CatalogResponse(BaseModel):
    """Selectable names for dashboard filters."""

    level: Literal["module", "file"]
    names: list[str]


class TimeseriesPointResponse(BaseModel):
    """One metric sample at a commit."""

    commit_order: int
    commit_hash: str
    value: float | int | None


class TimeseriesSeriesResponse(BaseModel):
    """Named metric series over commit history."""

    name: str
    points: list[TimeseriesPointResponse]


class TimeseriesResponse(BaseModel):
    """Complexity or size time series payload."""

    level: Literal["module", "file"]
    metric: str
    agg: str
    series: list[TimeseriesSeriesResponse]


class HotspotItemResponse(BaseModel):
    """One hotspot row."""

    name: str
    current: float
    first: float | None = None
    growth: float | None = None


class HotspotsResponse(BaseModel):
    """Top-N hotspot results."""

    by: Literal["value", "growth"]
    items: list[HotspotItemResponse]


class EdgeBreakdownResponse(BaseModel):
    """Graph-point breakdown for one edge."""

    model_reuse: int
    extension_or_method: int
    view: int
    field_property: int
    total: int


class EdgeResponse(BaseModel):
    """One coupling edge at a commit."""

    source: str
    target: str
    score: int
    kinds: dict[str, int]
    kind_occurrence_count: int = 0
    evidence_count: int = 0
    breakdown: EdgeBreakdownResponse | None = None
    commit_hash: str


class EvidenceResponse(BaseModel):
    """One evidence row for a coupling edge."""

    kind: str
    file_path: str
    line: int
    detail: str


class LineCategoriesResponse(BaseModel):
    """Line counts by category for one module."""

    python_lines: int
    js_lines: int
    python_test_lines: int
    xml_lines: int
    css_lines: int
    html_lines: int


class MetricDistributionResponse(BaseModel):
    """Complexity distribution summary."""

    count: int
    mean: float
    median: float
    p95: float
    max: float


class ModuleSnapshotItemResponse(BaseModel):
    """One module row at a commit."""

    module_name: str
    total_lines: int
    line_categories: LineCategoriesResponse
    python_file_count: int
    cyclomatic: MetricDistributionResponse
    cognitive: MetricDistributionResponse
    jones: MetricDistributionResponse
    declared_models: list[str]
    inherited_models: list[str]
    manifest_depends: list[str] = []
    score_in: int
    score_out: int
    python_complexity_parse_errors: int


class ModuleSnapshotResponse(BaseModel):
    """Module snapshot payload."""

    commit_hash: str
    modules: list[ModuleSnapshotItemResponse]


class FileSnapshotItemResponse(BaseModel):
    """One file row at a commit."""

    module_name: str
    relative_path: str
    top_folder: str
    category: str
    lines: int
    function_count: int
    jones_line_count: int
    cyclomatic: MetricDistributionResponse
    cognitive: MetricDistributionResponse
    jones: MetricDistributionResponse
    parse_error: str | None = None


class FileSnapshotResponse(BaseModel):
    """File snapshot payload."""

    commit_hash: str
    files: list[FileSnapshotItemResponse]


class ModuleDetailResponse(BaseModel):
    """One module snapshot with files and manifest depends."""

    commit_hash: str
    module: dict[str, Any]


class FileDetailResponse(BaseModel):
    """One file snapshot."""

    commit_hash: str
    file: FileSnapshotItemResponse


class GraphNodeResponse(BaseModel):
    """One graph node."""

    module_name: str
    total_lines: int
    line_categories: LineCategoriesResponse
    python_file_count: int
    method_count: int
    cyclomatic_median: float
    cognitive_median: float
    jones_median: float
    score_in: int
    score_out: int


class GraphEdgeResponse(BaseModel):
    """One graph edge."""

    source: str
    target: str
    score: int
    breakdown: EdgeBreakdownResponse


class GraphResponse(BaseModel):
    """Force-directed graph payload."""

    commit_hash: str
    nodes: list[GraphNodeResponse]
    edges: list[GraphEdgeResponse]


class EdgePointItemResponse(BaseModel):
    """Points for one breakdown category."""

    category: str
    points: int
    why_points: str = ""


class EdgePointsResponse(BaseModel):
    """Edge breakdown, points, and evidence."""

    commit_hash: str
    source: str
    target: str
    breakdown: EdgeBreakdownResponse
    points: list[EdgePointItemResponse]
    why_points: dict[str, str]
    evidence: list[EvidenceResponse]


class EdgePairRequest(BaseModel):
    """One coupling edge pair."""

    source: str
    target: str


class EdgePointsBatchRequest(BaseModel):
    """Batch edge-points lookup."""

    commit: str | None = None
    include_zero_score: bool = False
    pairs: list[EdgePairRequest]


class EdgePointsMissingPairResponse(BaseModel):
    """One edge pair absent from the batch result."""

    source: str
    target: str


class EdgePointsBatchResponse(BaseModel):
    """Edge breakdown payloads for many pairs."""

    commit_hash: str
    edges: list[EdgePointsResponse]
    missing: list[EdgePointsMissingPairResponse] = []


class EdgeEvidenceResponse(BaseModel):
    """Evidence rows for one coupling edge."""

    commit_hash: str
    source: str
    target: str
    evidence: list[EvidenceResponse]


class ModuleModelsResponse(BaseModel):
    """Declared and inherited model names for one module."""

    commit_hash: str
    module_name: str
    declared_models: list[str]
    inherited_models: list[str]


class ManifestDependItemResponse(BaseModel):
    """One in-scope manifest dependency row."""

    module_name: str
    depends_on: str


class ManifestDependsResponse(BaseModel):
    """Manifest dependencies at one commit."""

    commit_hash: str
    module_name: str | None = None
    depends_on: list[str] | None = None
    depends: list[ManifestDependItemResponse] | None = None


class FailureItemResponse(BaseModel):
    """One analysis failure at a commit."""

    commit_hash: str | None
    file_path: str | None
    error_text: str


class FailuresResponse(BaseModel):
    """Failures recorded for one commit."""

    commit_hash: str
    failures: list[FailureItemResponse]


class RelationsDiffChangeResponse(BaseModel):
    """One added or removed relation between commits."""

    source: str
    target: str
    change: Literal["added", "removed"]
    score_a: int | None
    score_b: int | None


class RelationsDiffResponse(BaseModel):
    """Relations diff between two commits."""

    commit_a: str
    commit_b: str
    changes: list[RelationsDiffChangeResponse]


class EdgeKindSeriesPointResponse(BaseModel):
    """Edge-kind count at one commit."""

    commit_order: int
    commit_hash: str
    kind: str
    value: int


class EdgeKindSeriesResponse(BaseModel):
    """Edge-kind series over history."""

    points: list[EdgeKindSeriesPointResponse]


class EdgesResponse(BaseModel):
    """Coupling edges for one commit."""

    commit_hash: str | None
    edges: list[EdgeResponse]


class StructurePointResponse(BaseModel):
    """Coupling structure summary at one commit."""

    commit_order: int
    commit_hash: str
    edge_count: int
    total_score: int


class StructureTimeseriesResponse(BaseModel):
    """Coupling structure change over commit history."""

    points: list[StructurePointResponse]
