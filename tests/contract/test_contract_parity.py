"""Contract parity tests (T081).

Verify that backend Pydantic schemas match the documented contract
shape used by frontend Zod schemas and contract markdown files.

These tests guard against silent contract drift between backend,
frontend, and documentation. The current shape is intentionally
kept in sync via the contract docs at:
    specs/005-ui-simplification-backend-driven/contracts/

The test compares Pydantic-generated JSON Schema against a curated
list of expected field names per type. If a field is added/removed
in either side, the test fails loudly.
"""

from __future__ import annotations

from pydantic import BaseModel

from ppi.query import metric_catalog
from ppi.query.schemas import (
    EdgeResponse,
    GenericTableResponse,
    GenericTableRow,
    GraphNodeResponse,
    GraphResponse,
    HotspotItemResponse,
    HotspotsResponse,
    ProjectInfoResponse,
    RelationRowResponse,
    RelationsResponse,
    TimeseriesPointResponse,
    TimeseriesResponse,
    TimeseriesSeriesResponse,
    UiColumnDefinition,
    UiConfigResponse,
    UiGraphConfig,
    UiMetricOption,
    UiOption,
    UiTableDefinition,
)


def _model_fields(model: type[BaseModel]) -> set[str]:
    """Return the field names declared on a Pydantic model."""
    return set(model.model_fields.keys())


def test_ui_config_response_fields() -> None:
    """UiConfigResponse must have exactly the documented fields."""
    assert _model_fields(UiConfigResponse) == {
        "dashboard_metrics",
        "aggregations",
        "tables",
        "graph",
    }
    assert _model_fields(UiGraphConfig) == {
        "edge_types",
        "line_categories",
        "brightness_metrics",
        "node_size_metrics",
        "link_thickness_metrics",
    }
    assert _model_fields(UiOption) == {"id", "label", "default_enabled"}
    assert _model_fields(UiMetricOption) == {"id", "label", "unit", "format", "default_enabled"}
    assert _model_fields(UiColumnDefinition) == {"key", "label", "type", "metric_id", "width"}
    assert _model_fields(UiTableDefinition) == {"key", "label", "columns"}


def test_generic_table_response_fields() -> None:
    """GenericTableResponse must have exactly the documented fields (cells/rows)."""
    assert _model_fields(GenericTableResponse) == {"commit_hash", "rows"}
    assert _model_fields(GenericTableRow) == {"id", "cells", "actions"}


def test_relations_response_fields() -> None:
    """RelationsResponse must have exactly the documented fields (relations)."""
    assert _model_fields(RelationsResponse) == {"commit_hash", "relations"}
    assert _model_fields(RelationRowResponse) == {
        "source_id",
        "source_label",
        "target_id",
        "target_label",
        "relation_type_id",
        "relation_type_label",
        "strength_metric_id",
        "strength_metric_label",
        "strength_value",
    }


def test_project_info_response_fields() -> None:
    """ProjectInfoResponse must have exactly the documented fields."""
    assert _model_fields(ProjectInfoResponse) == {
        "project_id",
        "branch",
        "commit_count",
        "schema_version",
        "store_present",
    }


def test_graph_response_fields() -> None:
    """GraphResponse / GraphNodeResponse / EdgeResponse must have exactly documented fields.

    Notably, GraphNodeResponse MUST NOT have `line_categories` (it was removed
    in UI-005; the value is stored as `line_counts` only).
    """
    assert _model_fields(GraphResponse) == {"commit_hash", "nodes", "edges"}
    assert _model_fields(GraphNodeResponse) == {
        "module_name",
        "total_lines",
        "metrics",
        "line_counts",
    }
    assert "line_categories" not in _model_fields(GraphNodeResponse)
    assert _model_fields(EdgeResponse) == {
        "source",
        "target",
        "score",
        "kinds",
        "kind_occurrence_count",
        "breakdown",
        "commit_hash",
    }


def test_timeseries_response_fields() -> None:
    """TimeseriesResponse must use `metric_id` (not `metric`)."""
    assert _model_fields(TimeseriesResponse) == {"level", "metric_id", "agg", "series"}
    assert "metric" not in _model_fields(TimeseriesResponse)
    assert _model_fields(TimeseriesSeriesResponse) == {"name", "points"}
    assert _model_fields(TimeseriesPointResponse) == {
        "commit_order",
        "commit_hash",
        "value",
    }


def test_hotspots_response_fields() -> None:
    """HotspotsResponse must have the documented fields."""
    assert _model_fields(HotspotsResponse) == {"by", "items"}
    assert _model_fields(HotspotItemResponse) == {"name", "current", "first", "growth"}


def test_metric_catalog_drives_ui_config() -> None:
    """The metric catalog must provide options for all UI config sections.

    Adding a new relation type, line category, aggregation, or graph view
    option requires updating metric_catalog (single source of truth).
    """
    assert {m.metric_id for m in metric_catalog.all_metrics()} == {
        "cyclomatic",
        "cognitive",
        "jones",
        "python_file_count",
        "lines",
        "lines_by_category",
        "jones_line_count",
        "function_count",
    }
    assert {r.id for r in metric_catalog.relation_types()} >= {
        "manifest_depends",
        "model_reuse",
        "extension_or_method",
        "view",
        "field_property",
    }
    assert {l.id for l in metric_catalog.line_categories()} >= {
        "python_lines",
        "css_lines",
        "html_lines",
        "js_lines",
        "xml_lines",
        "test_lines",
    }
    assert {a.id for a in metric_catalog.aggregations()} >= {
        "mean",
        "median",
        "p95",
        "max",
    }
    assert {o.id for o in metric_catalog.node_size_options()} >= {
        "total_lines",
        "visible_lines",
        "method_count",
        "score_in",
        "score_out",
        "fixed",
    }
    assert {o.id for o in metric_catalog.link_thickness_options()} >= {
        "score",
        "total_points",
        "selected_kind_points",
        "fixed",
    }


def test_metric_catalog_provides_relation_labels() -> None:
    """Catalog must provide display labels for relation types and strength metrics.

    Frontend `relation_type_label` and `strength_metric_label` come from
    the catalog — not hardcoded in storage queries.
    """
    assert metric_catalog.relation_type_label("manifest_depends") == "Manifest depends on"
    assert metric_catalog.relation_type_label("model_reuse") == "Model reuse"
    assert metric_catalog.relation_type_label("view") == "View"
    assert metric_catalog.relation_type_label("unknown_kind") == "unknown_kind"  # fallback

    assert metric_catalog.strength_metric_label("score") == "Edge score"
    assert metric_catalog.strength_metric_label("unknown_metric") == "unknown_metric"


def test_generic_table_row_supports_drilldown_actions() -> None:
    """GenericTableRow must support `id` and `actions: {drilldown?: bool}`."""
    fields = _model_fields(GenericTableRow)
    assert "id" in fields
    assert "actions" in fields
    assert "cells" in fields
    # Verify the actions model accepts a `drilldown` key
    row = GenericTableRow(id="mod_a", cells={"module_name": "mod_a"}, actions={"drilldown": True})
    assert row.id == "mod_a"
    assert row.actions == {"drilldown": True}
