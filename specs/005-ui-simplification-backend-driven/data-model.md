# Phase 1: Data Model

**Feature**: UI Simplification & Backend-Driven UI Model
**Date**: 2026-06-30

## Entities (API / Response Models)

### UiOption
Generic опция UI. Базовый строительный блок для категорий, типов связей, агрегаций.

| Field | Type | Notes |
|-------|------|-------|
| id | str | unique option id (e.g., `python_lines`, `mean`) |
| label | str | display label |
| default_enabled | bool = False | enabled by default in UI |

### UiMetricOption
Опция метрики для UI.

| Field | Type | Notes |
|-------|------|-------|
| id | str | metric id (e.g., `cyclomatic_mean`, `total_lines`) |
| label | str | display label |
| unit | str = "" | unit (e.g., `lines`) |
| format | str = "" | format hint (e.g., `.1f`, `d`) |
| default_enabled | bool = False | enabled by default |

Note: `scope`/`value_type`/`weight` существуют в metric catalog для backend валидации, но не экспортируются в `ui/config`.

### UiColumnDefinition
Определение колонки generic таблицы.

| Field | Type | Notes |
|-------|------|-------|
| key | str | column key (e.g., `module_name`, `total_lines`) |
| label | str | display label |
| type | str = "string" | `string` \| `number` \| `json` |
| metric_id | str \| None = None | ссылка на metric из catalog |
| width | int \| None = None | width hint |

### UiTableDefinition
Определение таблицы.

| Field | Type | Notes |
|-------|------|-------|
| key | str | table key (e.g., `modules`, `files`, `relations`) |
| label | str | display label |
| columns | list[UiColumnDefinition] | column definitions |

### UiGraphConfig
Конфигурация графа.

| Field | Type | Notes |
|-------|------|-------|
| edge_types | list[UiOption] | edge/relation type options |
| line_categories | list[UiOption] | line category options for UI toolbar (Python, CSS, HTML, JS, XML, Tests) — НЕ путать с `line_counts` в GraphNodeResponse |
| brightness_metrics | list[UiMetricOption] | brightness metric options |
| node_size_metrics | list[UiMetricOption] | node size metric options |
| link_thickness_metrics | list[UiMetricOption] | link thickness metric options |

### UiConfigResponse
Полный ответ `GET /api/ui/config`.

| Field | Type | Notes |
|-------|------|-------|
| dashboard_metrics | list[UiMetricOption] | dashboard metric options |
| aggregations | list[UiOption] | aggregation options (mean, median, p95, max) |
| tables | list[UiTableDefinition] | table definitions (modules, files, relations) |
| graph | UiGraphConfig | graph config |

### GenericTableRow
Строка generic таблицы (`snapshot/table/*`).

| Field | Type | Notes |
|-------|------|-------|
| id | str = "" | entity id (module name or file path) |
| cells | dict[str, Any] | key (из UiColumnDefinition.key) → value |
| actions | dict[str, bool] \| None = None | actions (drilldown to files) |

### GenericTableResponse
Ответ `GET /api/snapshot/table/modules` и `/files`.

| Field | Type | Notes |
|-------|------|-------|
| commit_hash | str | commit hash |
| rows | list[GenericTableRow] | data rows |

Column definitions берутся из `ui/config.tables`, не дублируются в response.

### RelationRowResponse
Строка связи (`GET /api/snapshot/relations`).

| Field | Type | Notes |
|-------|------|-------|
| source_id | str | source entity id |
| source_label | str | source display label |
| target_id | str | target entity id |
| target_label | str | target display label |
| relation_type_id | str | relation type id (e.g., `model_reuse`) |
| relation_type_label | str | relation type label |
| strength_metric_id | str = "" | strength metric id |
| strength_metric_label | str = "" | strength metric label |
| strength_value | float = 0 | strength value |

### RelationsResponse
Ответ `GET /api/snapshot/relations`.

| Field | Type | Notes |
|-------|------|-------|
| commit_hash | str | commit hash |
| relations | list[RelationRowResponse] | relation rows |

Column definitions берутся из `ui/config.tables.relations`, не дублируются в response.

### ProjectInfoResponse
Ответ `GET /api/project/info`.

| Field | Type | Notes |
|-------|------|-------|
| project_id | str | project id |
| branch | str | branch name |
| commit_count | int | total commit count |
| schema_version | int | storage schema version |
| store_present | bool | store exists |

### GraphNodeResponse (generic)
Узел графа (`GET /api/graph`).

| Field | Type | Notes |
|-------|------|-------|
| module_name | str | module name |
| total_lines | int | total line count |
| metrics | dict[str, float] | metric id → value (from catalog) |
| line_counts | dict[str, int] | line category id → count |

Removed: `line_categories` (was a duplicate of `line_counts`).

### EdgeResponse (generic, без evidence)
Ребро графа (`GET /api/graph`).

| Field | Type | Notes |
|-------|------|-------|
| source | str | source module |
| target | str | target module |
| score | int | total score |
| kinds | dict[str, int] | relation_type_id → count |
| kind_occurrence_count | int = 0 | total occurrence count |
| breakdown | dict[str, int] \| None = None | relation_type_id → graph-point count |
| commit_hash | str | commit hash |

### TimeseriesResponse (generic)
Ответ `GET /api/metrics/timeseries`.

| Field | Type | Notes |
|-------|------|-------|
| level | str | `module` \| `file` |
| metric_id | str | metric id (from catalog) |
| agg | str | aggregation (from ui/config.aggregations) |
| series | list[TimeseriesSeriesResponse] | series |

### TimeseriesSeriesResponse (generic)
| Field | Type | Notes |
|-------|------|-------|
| name | str | series name (entity name) |
| points | list[TimeseriesPointResponse] | points |

### TimeseriesPointResponse (generic)
| Field | Type | Notes |
|-------|------|-------|
| commit_order | int | commit order |
| commit_hash | str | commit hash |
| value | float \| int \| None | value |

### HotspotsResponse (generic)
Ответ `GET /api/hotspots`.

| Field | Type | Notes |
|-------|------|-------|
| by | str | `value` \| `growth` |
| items | list[HotspotItemResponse] | hotspot items |

### HotspotItemResponse (generic)
| Field | Type | Notes |
|-------|------|-------|
| name | str | entity name |
| current | float | current value |
| first | float \| None = None | first value |
| growth | float \| None = None | growth value |

### MetricDistribution (generic)
Distribution per metric.

| Field | Type | Notes |
|-------|------|-------|
| count | int | count |
| mean | float | mean |
| median | float | median |
| p95 | float | p95 |
| max | float | max |

## Storage Schema (DuckDB, JSON-колонки)

### module_aggregate (переработанная)
| Field | Type | Notes |
|-------|------|-------|
| commit_hash | VARCHAR | FK commit |
| module_name | VARCHAR | module name |
| total_lines | INTEGER | total lines |
| metrics | JSON | dict[str, float] — metric id → value |
| line_counts | JSON | dict[str, int] — category id → count |
| distributions | JSON | dict[str, MetricDistribution] — metric id → distribution |

Удалены: `python_file_count`, `method_count` (=cyclomatic count), `cc_*`, `cog_*`, `jones_*`, `score_in`, `score_out`, `declared_models_count`, `inherited_models_count`, `python_complexity_parse_errors`.

### file_metric (переработанная)
| Field | Type | Notes |
|-------|------|-------|
| commit_hash | VARCHAR | FK commit |
| module_name | VARCHAR | module name |
| file_path | VARCHAR | relative path |
| line_category_id | VARCHAR | dominant category id |
| metrics | JSON | dict[str, float] (включает `function_count`, `jones_line_count`, etc.) |
| line_counts | JSON | dict[str, int] |
| distributions | JSON | dict[str, MetricDistribution] — metric id → distribution |

Удалены: `top_folder`, `category`, `lines`, `cc_*`, `cog_*`, `jones_*`, `jones_line_count`, `function_count` (перемещён в `metrics` JSON).

### coupling_edge (переработанная: kinds/breakdown как JSON-колонки inline)
| Field | Type | Notes |
|-------|------|-------|
| commit_hash | VARCHAR | FK commit |
| source_module | VARCHAR | source |
| target_module | VARCHAR | target |
| score | INTEGER | total score |
| kinds | JSON | dict[str, int] — relation_type_id → count (inline, без отдельной таблицы `coupling_edge_kind`) |
| kind_occurrence_count | INTEGER | total |
| breakdown | JSON \| NULL | dict[str, int] — relation_type_id → graph-point count (inline, без отдельной таблицы `coupling_edge_breakdown`) |

### Удалённые таблицы
- `coupling_edge_evidence` — удалена (evidence не собирается)
- `module_manifest_depend` — удалена (manifest dependencies — follow-up task)
- `module_model` — удалена (declared/inherited models удаляются из UI)
- `coupling_edge_kind` — удалена (kinds хранятся inline как JSON-колонка `kinds: dict[str, int]` в `coupling_edge`)
- `coupling_edge_breakdown` — удалена (breakdown хранится inline как JSON-колонка `breakdown: dict[str, int] | None`)

### Оставшиеся таблицы (без изменений)
- `meta`, `project`, `analysis_run`, `commit`, `failure` (внутренняя диагностика)

## Core Contracts

### CouplingEdge (переработанный)
| Field | Type | Notes |
|-------|------|-------|
| source_module | str | source |
| target_module | str | target |
| score | int | total score |
| kinds | dict[str, int] | relation_type_id → count |
| breakdown | dict[str, int] \| None = None | relation_type_id → graph-point count |

Удалено: `evidence: tuple[Evidence, ...]`.

### EdgeBreakdown — удалён
Заменён на `dict[str, int]` inline в `CouplingEdge.breakdown`.

### ModuleFacts (переработанный)
Удалены: `python_complexity_parse_errors` (использовалось только для UI).

Оставлены как odoo-internal (нужны для извлечения relation rows в query layer, согласно принципу Q25): `declared_models`, `inherited_models`, `manifest_depends`.

Добавлены: `metrics: dict[str, float]`, `line_counts: dict[str, int]`.

> **Примечание**: `score_in`/`score_out`/`declared_models_count`/`inherited_models_count` никогда не были полями `ModuleFacts` (они в `ModuleAggregate`, `contracts.py`); они удаляются из `ModuleAggregate` (T002), не из `ModuleFacts`.

### Сохранённые enums (odoo pipeline internal)
- `LineCategory` (StrEnum) — определён в `value_objects.py`, используется в `file_classification.py` (odoo internal), маппится на string (`.value`) на выходе
- `EdgeKind` (StrEnum) — `value_objects.py`, маппится на string на выходе
- `EdgeKindGroup` (StrEnum) — `value_objects.py`, odoo internal

### Удалённые
- `LINE_CATEGORY_KEYS` в `pipeline.py` — заменён на динамический список из `line_counts` JSON
- `Evidence` struct (если был) — удалён с `CouplingEdge.evidence`
