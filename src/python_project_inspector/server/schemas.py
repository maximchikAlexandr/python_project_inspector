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


class EdgeResponse(BaseModel):
    """One coupling edge at a commit."""

    source: str
    target: str
    score: int
    kinds: dict[str, int]
    commit_hash: str


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
