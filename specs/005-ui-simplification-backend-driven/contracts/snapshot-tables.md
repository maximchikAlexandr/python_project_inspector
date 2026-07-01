# Contract: `GET /api/snapshot/table/modules` & `/files`

**Endpoints**:
- `GET /api/snapshot/table/modules?commit=...`
- `GET /api/snapshot/table/files?commit=...&module=...`

**RPC methods**: `snapshot/table/modules`, `snapshot/table/files`

## Request (modules)

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| commit | str | No | commit hash (latest if omitted) |

## Request (files)

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| commit | str | No | commit hash |
| module | str | Yes | module name |

## Response: `GenericTableResponse`

```python
class GenericTableRow(BaseModel):
    id: str
    label: str
    values: dict[str, str | number | None]  # column id -> value
    actions: dict[str, bool] | None = None   # {"drilldown": true} for modules

class GenericTableResponse(BaseModel):
    commit_hash: str
    table_id: str  # "modules" | "files"
    columns: list[UiColumnDefinition]
    rows: list[GenericTableRow]
```

## Notes

- Заменяют `GET /api/snapshot/modules` и `GET /api/snapshot/files` (удалены полностью).
- `columns` в response зеркалит `ui/config.tables.{modules,files}` — backend обеспечивает консистентность (один источник column definitions).
- Module rows имеют `actions: {"drilldown": true}` — frontend показывает кнопку `Files`.
- File rows не имеют drilldown; кнопка `Back to modules` управляется frontend state.
- `values` содержит generic metric/line_count/distribution values по column id из config.
- vscode-extension, CLI tests, contract tests переходят на эти endpoints.