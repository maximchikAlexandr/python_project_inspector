# Quickstart Validation Guide

**Feature**: UI Simplification & Backend-Driven UI Model
**Date**: 2026-06-30

## Prerequisites

- Python 3.11+, uv, DuckDB
- Node.js (для frontend build)
- Анализируемый Python/Odoo репозиторий

## Setup

```bash
# Backend
uv sync
uv run ppi index <path-to-repo>          # пересборка DuckDB с нуля (новая schema)

# Frontend
cd frontend && npm install && npm run build

# Server
uv run ppi serve --port 8000
```

## Validation Scenarios

### 1. `ui/config` endpoint

```bash
curl http://localhost:8000/api/ui/config | python -m json.tool
```

**Expected**: JSON с `graph` (line_categories, brightness_metrics, edge_types, node_size_metrics, link_thickness_metrics), `dashboard_metrics`, `aggregations`, `tables`. Все labels присутствуют, без hardcoded frontend констант.

### 2. Snapshot table endpoints

```bash
curl 'http://localhost:8000/api/snapshot/table/modules' | python -m json.tool
curl 'http://localhost:8000/api/snapshot/table/files?module=<module_name>' | python -m json.tool
```

**Expected**: `GenericTableResponse` с `commit_hash`, `table_id`, `columns` (из config), `rows`. Module rows имеют `actions: {"drilldown": true}`. Значения в `values` — generic по column id.

### 3. Relations endpoint

```bash
curl 'http://localhost:8000/api/snapshot/relations?include_zero_score=false' | python -m json.tool
```

**Expected**: `RelationsResponse` с `rows` содержащими `relation_type_id` (включая `manifest_depends`), `relation_type_label`, `strength_metric_label`, `strength_value`. Нет колонки `Evidence`.

### 4. Graph endpoint (generic)

```bash
curl 'http://localhost:8000/api/graph' | python -m json.tool
```

**Expected**: `nodes` с `metrics`/`line_counts` (dict), `edges` с `kinds`/`breakdown` (dict[str,int]). Нет `score_in`/`score_out`/`python_file_count`/`method_count`/`cyclomatic_median`/`evidence_count`.

### 5. Project info endpoint

```bash
curl http://localhost:8000/api/project/info | python -m json.tool
```

**Expected**: `{"project_id": "...", "repo_path": "..."}`. Нет `run_failures`.

### 6. Metrics timeseries (generic)

```bash
curl 'http://localhost:8000/api/metrics/timeseries?metric_id=cyclomatic&level=module&name=<module>&agg=mean' | python -m json.tool
curl 'http://localhost:8000/api/metrics/timeseries?metric_id=unknown' -i
```

**Expected**: Generic `TimeseriesResponse` с `metric_id`, `agg`, `series`. Unknown metric_id → 422.

### 7. Removed endpoints (404)

```bash
curl -i http://localhost:8000/api/structure/timeseries
curl -i http://localhost:8000/api/edge-points
curl -i http://localhost:8000/api/failures
curl -i http://localhost:8000/api/catalog
curl -i http://localhost:8000/api/status
curl -i http://localhost:8000/api/snapshot/modules
```

**Expected**: 404 для всех удалённых endpoint'ов.

### 8. Frontend UI

```bash
cd frontend && npm run dev
```

**Expected**:
- Верхняя навигация: только `Report` и `Dashboard` (нет Structure/Analytics/Status).
- Report: graph + treemap + иерархическая таблица модулей/файлов (drilldown) + relations table; нет accordion-блоков Parse failures/Python file complexity/Manifest depends; нет колонки Evidence.
- Dashboard: селекторы метрик и агрегаций из `ui/config` (нет hardcoded COMPLEXITY_METRICS/MODULE_METRICS/AGGS).
- Module detail panel: только name, active brightness metrics, line counts; нет score_in/out, declared/inherited models, manifest depends, parse errors.
- File detail panel: нет Parse error/Top folder/Category/Lines; остались path, functions, complexity distributions, AST/Jones lines.
- Treemap: нет служебного сегмента `.` в breadcrumb/legend; фильтрация по `line_category_id`.

### 9. Frontend source code (no hardcoded constants)

```bash
cd frontend
grep -r 'LINE_CATEGORIES\|BRIGHTNESS_CRITERIA\|GRAPH_BREAKDOWN_KINDS\|EDGE_KIND_LABELS' src/ --include='*.ts' --include='*.tsx'
grep -r 'COMPLEXITY_METRICS\|MODULE_METRICS\|AGGS' src/ --include='*.ts' --include='*.tsx'
```

**Expected**: нет совпадений (кроме, возможно, uiConfig types definitions).

### 10. CLI tests

```bash
uv run pytest tests/ -x
cd frontend && npm test
```

**Expected**: все тесты проходят (обновлённые под новую модель).

### 11. DuckDB schema (JSON columns)

```bash
uv run python -c "
import duckdb
con = duckdb.connect('analysis.duckdb')
print(con.execute('PRAGMA table_info(module_aggregate)').fetchall())
print(con.execute('PRAGMA table_info(file_metric)').fetchall())
print(con.execute('PRAGMA table_info(coupling_edge)').fetchall())
print([t for t in con.execute('SHOW TABLES').fetchall() if t[0] in ('coupling_edge_evidence','module_manifest_depend','module_model','coupling_edge_kind','coupling_edge_breakdown')])
"
```

**Expected**: `module_aggregate`/`file_metric`/`coupling_edge` имеют JSON-колонки (`metrics`, `line_counts`, `breakdown`, `kinds`); нет hardcoded cc_*/cog_*/jones_*/score_in/score_out/python_file_count колонок; таблицы `coupling_edge_evidence`/`module_manifest_depend`/`module_model`/`coupling_edge_kind`/`coupling_edge_breakdown` отсутствуют.