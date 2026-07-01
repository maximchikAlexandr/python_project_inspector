"""Unified metric/option catalog for backend-driven UI configuration and validation.

The catalog is the single source of truth for:
- metric definitions (id, scope, reader method, default_enabled)
- UI option rows for: relation types, line categories, aggregations
- graph view options: node size metrics, link thickness metrics

`Option` is the canonical row shape for the three UI option kinds. Graph
view options live in a separate tuple (no global id lookup — they have
overlapping ids across node_size/link_thickness sections).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class MetricDefinition:
    """One metric entry in the catalog."""

    metric_id: str
    label: str
    scope: str
    value_type: str
    unit: str | None = None
    format: str | None = None
    default_enabled: bool = False
    weight: float | None = None
    reader_method_module: str | None = None
    reader_method_file: str | None = None


@dataclass(frozen=True, slots=True)
class Option:
    """One UI option row for relation types / line categories / aggregations.

    `description` is used in tooltips for relation types. Empty for kinds
    that don't need a description.
    """

    id: str
    label: str
    kind: Literal["relation_type", "line_category", "aggregation"]
    default_enabled: bool = False
    description: str = ""


@dataclass(frozen=True, slots=True)
class GraphViewOption:
    """One display-mode option for graph node size / link thickness controls.

    These are not real metrics — they're synthetic control values like
    ``"fixed"``, ``"visible_lines"``, ``"total_points"``. Overlapping ids
    across node_size/link_thickness are intentional.
    """

    id: str
    label: str
    default_enabled: bool = False


_METRICS: tuple[MetricDefinition, ...] = (
    MetricDefinition(
        metric_id="cyclomatic",
        label="Cyclomatic complexity",
        scope="both",
        value_type="number",
        default_enabled=True,
        reader_method_module="module_complexity_timeseries",
        reader_method_file="file_complexity_timeseries",
    ),
    MetricDefinition(
        metric_id="cognitive",
        label="Cognitive complexity",
        scope="both",
        value_type="number",
        default_enabled=True,
        reader_method_module="module_complexity_timeseries",
        reader_method_file="file_complexity_timeseries",
    ),
    MetricDefinition(
        metric_id="jones",
        label="Jones complexity",
        scope="both",
        value_type="number",
        default_enabled=True,
        reader_method_module="module_complexity_timeseries",
        reader_method_file="file_complexity_timeseries",
    ),
    MetricDefinition(
        metric_id="python_file_count",
        label="Python file count",
        scope="module",
        value_type="number",
        unit="files",
        default_enabled=False,
        reader_method_module="python_file_count_timeseries",
        reader_method_file=None,
    ),
    MetricDefinition(
        metric_id="lines",
        label="Total lines",
        scope="both",
        value_type="number",
        unit="lines",
        default_enabled=True,
        reader_method_module="module_lines_timeseries",
        reader_method_file="file_lines_timeseries",
    ),
    MetricDefinition(
        metric_id="lines_by_category",
        label="Lines by category",
        scope="module",
        value_type="number",
        unit="lines",
        default_enabled=False,
        reader_method_module="module_lines_by_category_timeseries",
        reader_method_file=None,
    ),
    MetricDefinition(
        metric_id="jones_line_count",
        label="Jones measured lines",
        scope="file",
        value_type="number",
        unit="lines",
        default_enabled=False,
        reader_method_file="file_jones_line_count",
    ),
    MetricDefinition(
        metric_id="function_count",
        label="Function count",
        scope="file",
        value_type="number",
        unit="functions",
        default_enabled=False,
        reader_method_file="file_function_count",
    ),
)

_METRICS_BY_ID: dict[str, MetricDefinition] = {m.metric_id: m for m in _METRICS}

_OPTIONS: tuple[Option, ...] = (
    Option(id="manifest_depends", label="Manifest depends on", kind="relation_type",
           default_enabled=True,
           description="Module-to-module dependency declared in __manifest__.py"),
    Option(id="model_reuse", label="Model reuse", kind="relation_type",
           default_enabled=True,
           description="Reusing models from another module (inherit or pool)."),
    Option(id="extension_or_method", label="Extension / method", kind="relation_type",
           default_enabled=True,
           description="Calling extension methods or service methods on another module."),
    Option(id="view", label="View", kind="relation_type", default_enabled=True,
           description="Embedding views or referencing view definitions."),
    Option(id="field_property", label="Field / property", kind="relation_type",
           default_enabled=True,
           description="Referencing fields or properties of another module."),
    Option(id="python_lines", label="Python", kind="line_category", default_enabled=True),
    Option(id="css_lines", label="CSS", kind="line_category", default_enabled=False),
    Option(id="html_lines", label="HTML", kind="line_category", default_enabled=False),
    Option(id="js_lines", label="JS", kind="line_category", default_enabled=False),
    Option(id="xml_lines", label="XML", kind="line_category", default_enabled=False),
    Option(id="test_lines", label="Tests", kind="line_category", default_enabled=True),
    Option(id="mean", label="Mean", kind="aggregation", default_enabled=True),
    Option(id="median", label="Median", kind="aggregation", default_enabled=True),
    Option(id="p95", label="P95", kind="aggregation", default_enabled=False),
    Option(id="max", label="Max", kind="aggregation", default_enabled=False),
)

_OPTIONS_BY_ID: dict[str, Option] = {o.id: o for o in _OPTIONS}

_NODE_SIZE_OPTIONS: tuple[GraphViewOption, ...] = (
    GraphViewOption(id="total_lines", label="Total Lines", default_enabled=True),
    GraphViewOption(id="visible_lines", label="Visible Lines", default_enabled=False),
    GraphViewOption(id="method_count", label="Methods", default_enabled=False),
    GraphViewOption(id="score_in", label="Score In", default_enabled=False),
    GraphViewOption(id="score_out", label="Score Out", default_enabled=False),
    GraphViewOption(id="fixed", label="Fixed", default_enabled=False),
)

_LINK_THICKNESS_OPTIONS: tuple[GraphViewOption, ...] = (
    GraphViewOption(id="score", label="Score", default_enabled=True),
    GraphViewOption(id="total_points", label="Total Points", default_enabled=False),
    GraphViewOption(id="selected_kind_points", label="Kind Points", default_enabled=False),
    GraphViewOption(id="fixed", label="Fixed", default_enabled=False),
)

_STRENGTH_METRIC_LABELS: dict[str, str] = {"score": "Edge score"}


def all_metrics() -> tuple[MetricDefinition, ...]:
    """Return all metric definitions."""
    return _METRICS


def metric_ids() -> tuple[str, ...]:
    """Return all valid metric ids."""
    return tuple(_METRICS_BY_ID.keys())


def get_metric(metric_id: str) -> MetricDefinition | None:
    """Return metric definition by id, or None if unknown."""
    return _METRICS_BY_ID.get(metric_id)


def validate_metric_id(metric_id: str, level: str | None = None) -> str:
    """Validate metric_id against catalog; return it if valid.

    Raises:
        ValueError: if metric_id is unknown or does not support the requested level.
    """
    metric = _METRICS_BY_ID.get(metric_id)
    if metric is None:
        raise ValueError(f"Unknown metric_id: {metric_id}")
    if level is not None:
        if metric.scope == "module" and level != "module":
            raise ValueError(f"Metric '{metric_id}' only supports module scope")
        if metric.scope == "file" and level != "file":
            raise ValueError(f"Metric '{metric_id}' does not support file scope")
    return metric_id


def reader_method_for(metric_id: str, level: str) -> str:
    """Return the reader method name for a metric_id and level.

    Raises:
        ValueError: if metric_id is unknown or does not support the requested level.
    """
    metric = _METRICS_BY_ID.get(metric_id)
    if metric is None:
        raise ValueError(f"Unknown metric_id: {metric_id}")
    if level == "module":
        if metric.reader_method_module is None:
            raise ValueError(f"Metric '{metric_id}' does not support module scope")
        return metric.reader_method_module
    if level == "file":
        if metric.reader_method_file is None:
            raise ValueError(f"Metric '{metric_id}' does not support file scope")
        return metric.reader_method_file
    raise ValueError(f"Unknown level: {level}")


def _by_kind(kind: str) -> tuple[Option, ...]:
    return tuple(o for o in _OPTIONS if o.kind == kind)


def relation_types() -> tuple[Option, ...]:
    return _by_kind("relation_type")


def line_categories() -> tuple[Option, ...]:
    return _by_kind("line_category")


def aggregations() -> tuple[Option, ...]:
    return _by_kind("aggregation")


def node_size_options() -> tuple[GraphViewOption, ...]:
    return _NODE_SIZE_OPTIONS


def link_thickness_options() -> tuple[GraphViewOption, ...]:
    return _LINK_THICKNESS_OPTIONS


def get_option(option_id: str) -> Option | None:
    """Return a UI option by id, or None if unknown."""
    return _OPTIONS_BY_ID.get(option_id)


def relation_type_label(kind_key: str) -> str:
    """Return a human-readable label for a relation type id."""
    opt = _OPTIONS_BY_ID.get(kind_key)
    return opt.label if opt is not None else kind_key


def strength_metric_label(metric_id: str) -> str:
    """Return a label for a strength metric id used in relation rows."""
    return _STRENGTH_METRIC_LABELS.get(metric_id, metric_id)
