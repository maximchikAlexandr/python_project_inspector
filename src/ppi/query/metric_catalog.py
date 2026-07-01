"""Unified metric catalog for backend-driven UI configuration and validation."""

from __future__ import annotations

from dataclasses import dataclass


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
        reader_method_module=None,
        reader_method_file="file_jones_line_count",
    ),
    MetricDefinition(
        metric_id="function_count",
        label="Function count",
        scope="file",
        value_type="number",
        unit="functions",
        default_enabled=False,
        reader_method_module=None,
        reader_method_file="file_function_count",
    ),
)

_BY_ID: dict[str, MetricDefinition] = {m.metric_id: m for m in _METRICS}


def all_metrics() -> tuple[MetricDefinition, ...]:
    """Return all metric definitions."""
    return _METRICS


def metric_ids() -> tuple[str, ...]:
    """Return all valid metric ids."""
    return tuple(_BY_ID.keys())


def get_metric(metric_id: str) -> MetricDefinition | None:
    """Return metric definition by id, or None if unknown."""
    return _BY_ID.get(metric_id)


def validate_metric_id(metric_id: str, level: str | None = None) -> str:
    """Validate metric_id against catalog; return it if valid.

    Raises:
        ValueError: if metric_id is unknown or does not support the requested level.
    """
    metric = _BY_ID.get(metric_id)
    if metric is None:
        raise ValueError(f"Unknown metric_id: {metric_id}")
    if level is not None:
        if metric.scope == "module" and level != "module":
            raise ValueError(f"Metric '{metric_id}' only supports module scope")
        if metric.scope == "file" and level != "file":
            raise ValueError(f"Metric '{metric_id}' only supports file scope")
    return metric_id


def reader_method_for(metric_id: str, level: str) -> str:
    """Return the reader method name for a metric_id and level.

    Raises:
        ValueError: if metric_id is unknown or does not support the requested level.
    """
    metric = _BY_ID.get(metric_id)
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