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
```

## Notes

- Временный источник данных: backend собирает `UiConfigResponse` из текущих известных категорий/метрик до plugin registry.
- `aggregations` — общий список (mean, median, p95, max), не per-metric.
- `tables` — список определений для `modules`, `files`, `relations` таблиц; frontend находит таблицу по `key`.
- `UiColumnDefinition.type` может быть `"string"`, `"number"`, `"json"`.
- `UiColumnDefinition.metric_id` — ссылка на metric из catalog, если колонка отображает метрику.
- Frontend получает все опции UI из этого единственного endpoint; не содержит жестко закодированных констант.
- `UiMetricOption` не включает `scope`/`value_type`/`weight` — эти поля используются в metric catalog для backend валидации, но не экспортируются в UI config.
