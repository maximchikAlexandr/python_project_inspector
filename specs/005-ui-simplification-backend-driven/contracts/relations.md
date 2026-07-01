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
```

## Notes

- Заменяет `edge-points`, `edge-points/batch`, `edge-evidence`, `depends` (все удалены).
- Строки строятся из `coupling_edge.kinds` (relation type → count) и `module_aggregate.manifest_depends` (manifest dependencies).
- Manifest dependencies представлены как relation rows с `relation_type_id = "manifest_depends"`, `relation_type_label = "Manifest depends on"`, `strength_metric_id = ""`, `strength_metric_label = ""`, `strength_value = 0.0`.
- `module_aggregate.manifest_depends` хранится как comma-separated строка in-scope зависимостей (фильтруется через `in_scope_manifest_depends` в `analysis_mappers`).
- Column definitions **не** дублируются в response — frontend берёт их из `ui/config.tables.relations`.
- `relation_type_label` и `strength_metric_label` приходят из backend.
- Не содержит колонку `Evidence`, Odoo-specific category list, hardcoded `edgeKindLabel()`.
- Frontend рендерит `RelationsTable` generic по `columns` (из ui/config) + `relations`.

## Schema Migration

Manifest dependencies потребовали schema v3 → v4 (добавлена колонка `manifest_depends VARCHAR` в `module_aggregate`). Существующие DB пересобираются через `analyze --rebuild` или migrate автоматически (migration statement: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS manifest_depends VARCHAR DEFAULT ''`).
