# Phase 1: Data Model

**Feature**: UI Simplification & Backend-Driven UI Model
**Date**: 2026-06-30

## Entities (API / Response Models)

### UiOption
Generic опция UI. Базовый строительный блок для категорий, типов связей, агрегаций.

| Field | Type | Notes |
|-------|------|-------|
| id | str | unique option id (e.g., `python_lines`, `mean`, `manifest_depends`) |
| label | str | display label |
| description | str \| None = None | optional description |
| default_enabled | bool = False | enabled by default in UI |

### UiMetricOption
Опция метрики. Расширяет UiOption полями для метрик.

| Field | Type | Notes |
|-------|------|-------|
| id | str | metric id (e.g., `cyclomatic`, `python_file_count`) |
| label | str | display label |
| scope | str | `module` \| `file` \| `both` |
| value_type | str = "number" | value type |
| unit | str \| None = None | unit (e.g., `lines`) |
| format | str \| None = None | format hint |
| default_enabled | bool = False | enabled by default |
| weight | float \| None = None | weight for scoring |

### UiColumnDefinition
Определение колонки generic таблицы.

| Field | Type | Notes |
|-------|------|-------|
| id | str | column id (e.g., `total_lines`, `cyclomatic_median`) |
| label | str | display label |
| value_type | str | `number` \| `string` \| `distribution` |
| format | str \| None = None | format hint |
| align | str = "left" | `left` \| `right` \| `center` |
| visible_by_default | bool = True | visible by default |

### UiTableDefinition
Определение таблицы.

| Field | Type | Notes |
|-------|------|-------|
| id | str | table id (e.g., `modules`, `files`, `relations`) |
| label | str | display label |
| columns | list[UiColumnDefinition] | column definitions |

### UiGraphConfig
Конфигурация графа.

| Field | Type | Notes |
|-------|------|-------|
| line_categories | list[UiOption] | line category options |
| brightness_metrics | list[UiMetricOption] | brightness metric options |
| edge_types | list[UiOption] | edge/relation type options |
| node_size_metrics | list[UiMetricOption] | node size metric options |
| link_thickness_metrics | list[UiMetricOption] | link thickness metric options |

### UiConfigResponse
Полный ответ `GET /api/ui/config`.

| Field | Type | Notes |
|-------|------|-------|
| graph | UiGraphConfig | graph config |
| dashboard_metrics | list[UiMetricOption] | dashboard metric options |
| aggregations | list[UiOption] | aggregation options (mean, median, p95, max) |
| tables | dict[str, UiTableDefinition] | table definitions (modules, files, relations) |

### GenericTableRow
Строка generic таблицы (`snapshot/table/*`).

| Field | Type | Notes |
|-------|------|-------|
| id | str | entity id (module name or file path) |
| label | str | display label |
| values | dict[str, str \| number \| None] | column id → value (from UiColumnDefinition) |
| actions | { drilldown?: bool } \| None = None | actions (drilldown to files) |

### GenericTableResponse
Ответ `GET /api/snapshot/table/modules` и `/files`.

| Field | Type | Notes |
|-------|------|-------|
| commit_hash | str | commit hash |
| table_id | str | table id (`modules` \| `files`) |
| columns | list[UiColumnDefinition] | column definitions (from ui/config) |
| rows | list[GenericTableRow] | data rows |

### RelationRowResponse
Строка связи (`GET /api/snapshot/relations`).

| Field | Type | Notes |
|-------|------|-------|
| source_id | str | source entity id |
| source_label | str | source display label |
| source_kind | str \| None = None | source kind (module) |
| target_id | str | target entity id |
| target_label | str | target display label |
| target_kind | str \| None = None | target kind (module) |
| relation_type_id | str | relation type id (e.g., `manifest_depends`, `model_reuse`) |
| relation_type_label | str | relation type label (from config) |
| strength_metric_id | str | strength metric id (e.g., `score`) |
| strength_metric_label | str | strength metric label |
| strength_value | float | strength value |

### RelationsResponse
Ответ `GET /api/snapshot/relations`.

| Field | Type | Notes |
|-------|------|-------|
| commit_hash | str | commit hash |
| columns | list[UiColumnDefinition] | column definitions (from ui/config.tables.relations) |
| rows | list[RelationRowResponse] | relation rows |

### ProjectInfoResponse
Ответ `GET /api/project/info`.

| Field | Type | Notes |
|-------|------|-------|
| project_id | str | project id |
| repo_path | str \| None | repo path |

### GraphNodeResponse (generic)
Узел графа (`GET /api/graph`).

| Field | Type | Notes |
|-------|------|-------|
| module_name | str | module name |
| metrics | dict[str, float] | metric id → value (from catalog) |
| line_counts | dict[str, int] | line category id → count |

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
| metric_id | str | metric id (from catalog) |
| agg | str | aggregation (from ui/config.aggregations) |
| level | str | `module` \| `file` |
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
| value | float | value |

### HotspotsResponse (generic)
Ответ `GET /api/hotspots`.

| Field | Type | Notes |
|-------|------|-------|
| metric_id | str | metric id (from catalog) |
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

### FileSnapshotItemResponse (generic, без Odoo fields)
Файл в `snapshot/table/files` rows.

| Field | Type | Notes |
|-------|------|-------|
| module_name | str | module name |
| file_path | str | relative path |
| line_category_id | str | dominant line category id (backend-computed) |
| metrics | dict[str, float] | metric id → value (cyclomatic_median, etc.) |
| line_counts | dict[str, int] | line category id → count |
| distributions | dict[str, MetricDistribution] | metric id → distribution |

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
- `module_manifest_depend` — удалена (manifest → relation rows из фактов)
- `module_model` — удалена (declared/inherited models удаляются из UI)
- `coupling_edge_kind` — удалена (kinds хранятся inline как JSON-колонка `kinds: dict[str, int]` в `coupling_edge`; отдельная таблица избыточна)
- `coupling_edge_breakdown` — удалена (breakdown хранится inline как JSON-колонка `breakdown: dict[str, int] | None` в `coupling_edge`; отдельная таблица избыточна)

### Оставшиеся таблицы (без изменений)
- `meta`, `project`, `analysis_run`, `commit`, `failure` (внутренняя диагностика)

> **Примечание**: `coupling_edge_kind` и `coupling_edge_breakdown` удалены — `kinds`/`breakdown` хранятся inline как JSON-колонки в `coupling_edge`. `module_model`, `module_manifest_depend`, `coupling_edge_evidence` удалены (см. выше).

## Core Contracts (msgspec)

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