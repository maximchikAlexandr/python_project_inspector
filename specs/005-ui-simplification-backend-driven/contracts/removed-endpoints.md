# Removed Endpoints

Следующие endpoint'ы удаляются из `QueryMethod`/`_METHOD_TABLE`/FastAPI полностью; CLI-команды и тесты обновляются/удаляются.

## HTTP endpoints (удалены)

| Endpoint | Замена |
|----------|--------|
| `GET /api/structure/timeseries` | — (удаляется; structure tab удалён) |
| `GET /api/edge-kinds/timeseries` | — (удаляется) |
| `GET /api/relations/diff` | — (удаляется) |
| `GET /api/failures` | — (удаляется из user-facing API; внутренний сбор failures остаётся для CLI doctor) |
| `GET /api/depends` | `GET /api/snapshot/relations` (manifest_depends как relation rows) |
| `GET /api/models` | — (удаляется; declared/inherited models удалены из UI) |
| `GET /api/edge-evidence` | `GET /api/snapshot/relations` (без evidence) |
| `GET /api/edge-points` | `GET /api/snapshot/relations` |
| `POST /api/edge-points/batch` | `GET /api/snapshot/relations` |
| `GET /api/catalog` | `GET /api/snapshot/table/*` rows + `ui/config` |
| `GET /api/status` | `GET /api/project/info` (project metadata only); diagnostics → CLI doctor |
| `GET /api/snapshot/modules` | `GET /api/snapshot/table/modules` |
| `GET /api/snapshot/files` | `GET /api/snapshot/table/files` |
| `GET /api/edges` | `GET /api/graph` + `GET /api/snapshot/relations` |
| `GET /api/snapshot/module` | `GET /api/snapshot/table/modules` (detail panels берут данные из table rows) |
| `GET /api/snapshot/file` | `GET /api/snapshot/table/files` (detail panels берут данные из table rows) |

## RPC methods (удалены из QueryMethod enum и _METHOD_TABLE)

- `STRUCTURE_TIMESERIES`
- `EDGE_POINTS`
- `EDGE_POINTS_BATCH`
- `EDGE_EVIDENCE`
- `EDGE_KIND_TIMESERIES`
- `RELATIONS_DIFF`
- `FAILURES`
- `DEPENDS`
- `MODELS`
- `CATALOG`
- `STATUS`
- `SNAPSHOT_MODULES`
- `SNAPSHOT_FILES`
- `SNAPSHOT_MODULE`
- `SNAPSHOT_FILE`
- `EDGES`

## CLI commands (обновляются/удаляются)

- `ppi query edge-points` — удаляется
- `ppi query edge-evidence` — удаляется
- `ppi query structure-timeseries` — удаляется
- `ppi query edge-kinds-timeseries` — удаляется
- `ppi query relations-diff` — удаляется
- `ppi query failures` — удаляется (внутренний doctor остаётся)
- `ppi query depends` — удаляется (manifest → relations)
- `ppi query models` — удаляется
- `ppi query edges` — удаляется (покрывается `graph` и `snapshot/relations`)
- `ppi query catalog` — удаляется (имена из `snapshot/table/*` rows + `ui/config`)
- `ppi query status` — удаляется (diagnostics → CLI `doctor`; project metadata → `project/info`)
- `ppi query graph` — обновляется на generic contract
- `ppi query snapshot/modules` → `ppi query snapshot/table/modules` — обновляется
- `ppi query snapshot/files` → `ppi query snapshot/table/files` — обновляется
- `ppi query snapshot/module` — удаляется (detail из table rows)
- `ppi query snapshot/file` — удаляется (detail из table rows)
- `ppi query metrics-timeseries` — обновляется (`metric_id: str`, generic contract)
- `ppi query hotspots` — обновляется (`metric_id: str`, generic contract)

## Tests (обновляются)

- `tests/contract/test_query_dispatch_parity.py` — удалить parity для удалённых methods; добавить для новых
- `tests/contract/test_restored_http_contract.py` — удалить edge-points/edge-evidence/relations-diff/failures/depends/models/catalog/status тесты; добавить ui/config/snapshot-table/relations/project-info
- `tests/contract/test_http_api.py` — обновить
- `tests/contract/test_snapshot_reads.py` — обновить на snapshot/table/*
- `tests/integration/test_dashboard_api.py` — удалить structure/status; обновить catalog → ui/config
- `tests/integration/test_edge_inclusion.py` — обновить
- `tests/integration/test_snapshot_parity.py` — обновить на snapshot/table/*
- `tests/integration/test_quickstart_flow.py` — обновить status → project/info; catalog → ui/config
- `tests/unit/test_facts.py` — EdgeBreakdown → dict; удалить Odoo-specific fields
- `tests/unit/test_restored_metrics.py` — обновить
- `tests/unit/test_pure_modules.py` — обновить breakdown

## Оставшиеся endpoints (без изменений путей)

| Endpoint | Notes |
|----------|-------|
| `GET /api/commits` | Без изменений |
| `GET /api/metrics/timeseries` | Обновлён contract: `metric_id` (generic), catalog-driven validation |
| `GET /api/hotspots` | Обновлён contract: `metric_id` (generic), catalog-driven validation |
| `GET /api/graph` | Обновлён contract: generic nodes/edges |