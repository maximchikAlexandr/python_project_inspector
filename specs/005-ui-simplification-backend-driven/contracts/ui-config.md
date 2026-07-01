# Contract: `GET /api/ui/config`

**Endpoint**: `GET /api/ui/config`
**RPC method**: `ui/config`

## Request

No parameters.

## Response: `UiConfigResponse`

```python
class UiOption(BaseModel):
    id: str
    label: str
    description: str | None = None
    default_enabled: bool = False

class UiMetricOption(BaseModel):
    id: str
    label: str
    scope: str  # "module" | "file" | "both"
    value_type: str = "number"
    unit: str | None = None
    format: str | None = None
    default_enabled: bool = False
    weight: float | None = None

class UiColumnDefinition(BaseModel):
    id: str
    label: str
    value_type: str  # "number" | "string" | "distribution"
    format: str | None = None
    align: str = "left"  # "left" | "right" | "center"
    visible_by_default: bool = True

class UiTableDefinition(BaseModel):
    id: str
    label: str
    columns: list[UiColumnDefinition]

class UiGraphConfig(BaseModel):
    line_categories: list[UiOption]
    brightness_metrics: list[UiMetricOption]
    edge_types: list[UiOption]
    node_size_metrics: list[UiMetricOption]
    link_thickness_metrics: list[UiMetricOption]

class UiConfigResponse(BaseModel):
    graph: UiGraphConfig
    dashboard_metrics: list[UiMetricOption]
    aggregations: list[UiOption]
    tables: dict[str, UiTableDefinition]
```

## Notes

- Временный источник данных: backend собирает `UiConfigResponse` из текущих известных категорий/метрик до plugin registry.
- `aggregations` — общий список (mean, median, p95, max), не per-metric.
- `tables` — определения для `modules`, `files`, `relations` таблиц; колонки те же, что в `GenericTableResponse.columns` и `RelationsResponse.columns`.
- Frontend получает все опции UI из этого единственного endpoint; не содержит жестко закодированных констант.