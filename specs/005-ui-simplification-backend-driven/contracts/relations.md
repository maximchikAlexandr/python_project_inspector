# Contract: `GET /api/snapshot/relations`

**Endpoint**: `GET /api/snapshot/relations?commit=...&include_zero_score=false`
**RPC method**: `snapshot/relations`

## Request

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| commit | str | No | latest | commit hash |
| include_zero_score | bool | No | false | include zero-score relations |

## Response: `RelationsResponse`

```python
class RelationRowResponse(BaseModel):
    source_id: str
    source_label: str
    source_kind: str | None = None
    target_id: str
    target_label: str
    target_kind: str | None = None
    relation_type_id: str
    relation_type_label: str
    strength_metric_id: str
    strength_metric_label: str
    strength_value: float

class RelationsResponse(BaseModel):
    commit_hash: str
    columns: list[UiColumnDefinition]
    rows: list[RelationRowResponse]
```

## Notes

- Заменяет `edge-points`, `edge-points/batch`, `edge-evidence`, `depends` (все удалены).
- Manifest dependencies представлены как rows с `relation_type_id = "manifest_depends"` (извлекаются из фактов в query layer, не из `module_manifest_depend` таблицы — таблица удалена).
- `relation_type_label` и `strength_metric_label` приходят из `ui/config.graph.edge_types`.
- `columns` в response зеркалит `ui/config.tables.relations` — backend обеспечивает консистентность.
- Не содержит колонку `Evidence`, Odoo-specific category list, hardcoded `edgeKindLabel()`.
- Frontend рендерит `RelationsTable` generic по `columns` + `rows`.