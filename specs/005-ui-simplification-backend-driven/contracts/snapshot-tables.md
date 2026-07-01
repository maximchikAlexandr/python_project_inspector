# Contract: `GET /api/snapshot/table/modules` & `/files`

**Endpoints**:
- `GET /api/snapshot/table/modules?commit=...`
- `GET /api/snapshot/table/files?commit=...&module_name=...`

**RPC methods**: `snapshot/table/modules`, `snapshot/table/files`

## Request (modules)

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| commit | str | No | commit hash (latest if omitted) |

## Request (files)

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| commit | str | No | commit hash |
| module_name | str | No | module name (all modules if omitted) |

## Response: `GenericTableResponse`

```python
class GenericTableRow(BaseModel):
    id: str = ""                # entity id (module name or file path)
    cells: dict[str, Any]       # key (from UiColumnDefinition.key) -> value
    actions: dict[str, bool] | None = None   # {"drilldown": true} for modules

class GenericTableResponse(BaseModel):
    commit_hash: str
    rows: list[GenericTableRow]
```

## Notes

- Заменяют `GET /api/snapshot/modules` и `GET /api/snapshot/files` (удалены полностью).
- Column definitions **не** дублируются в response — frontend берёт их из `ui/config.tables` по ключу (`modules`/`files`).
- `cells` — плоский словарь; каждое значение соответствует колонке по ключу.
- Module rows содержат `id = module_name`, `actions: {"drilldown": true}` и `line_counts`/`metrics` в виде JSON-объектов внутри `cells`.
- File rows содержат `actions: null` (нет drilldown) и `metrics`/`line_counts`/`distributions` внутри `cells`.
- `module_name` в request опционален; если не указан, возвращаются файлы всех модулей.
- `module_name` в response (в cells) позволяет frontend фильтровать файлы выбранного модуля.
- vscode-extension, CLI tests, contract tests переходят на эти endpoints.
