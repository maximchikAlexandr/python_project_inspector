# Phase 0: Research

**Feature**: UI Simplification & Backend-Driven UI Model
**Date**: 2026-06-30

## R1: Формат хранения метрик в DuckDB — JSON-колонки vs EAV

**Decision**: JSON-колонки (`metrics: JSON`, `line_counts: JSON`, `breakdown: JSON`) в существующих таблицах (`module_aggregate`, `file_metric`, `coupling_edge`).

**Rationale**: JSON-колонки минимально затрагивают schema (не вводят новые таблицы), сохраняют single-writer model, читаются одним SELECT. DuckDB поддерживает JSON-тип с функциями извлечения (`json_extract`/`->`). Frontend получает `dict[str, float/int]` без дополнительной нормализации в query layer. Согласовано с принципом тонкого frontend (логика на backend).

**Alternatives considered**:
- EAV-таблицы (`module_metric (commit_id, module_name, metric_id, value)`) — больше таблиц, JOIN на чтение, сложнее writer; отвергнуты как избыточные при отсутствии plugin registry.
- Оставить hardcoded колонки — противоречит generic UI и решениям Q5/Q6.

## R2: Metric catalog — единый источник для `ui/config` и валидации

**Decision**: Единый metric catalog в backend (Python-модуль/словарь), питающий одновременно `ui/config.dashboard_metrics` и валидацию `/metrics/timeseries`/`/hotspots`.

**Rationale**: Одна точка правды — добавление метрики в catalog автоматически делает её доступной в UI и валидной для timeseries/hotspots. Hardcoded sets в `_handlers.py`/`requests.py` удаляются. Catalog содержит mapping `metric_id → (scope, reader-method, value_type, label, ...)`. До plugin registry catalog собирается из текущих известных метрик (`cyclomatic`, `cognitive`, `jones`, `python_file_count`, `lines`, `lines_by_category`).

**Alternatives considered**:
- Отдельный `/api/metrics/catalog` endpoint — отвергнут (Q8): избыточен, `ui/config.dashboard_metrics` достаточен.
- Frontend-валидация — отвергнута: нарушение thin-frontend принципа.

## R3: `line_category_id` — вычисление dominant category

**Decision**: Backend вычисляет `line_category_id: str` (dominant category per file) из `line_counts` (ключ с максимальным значением) или из `file_classification.classify_file()` в odoo pipeline, и добавляет в `FileSnapshotItemResponse`.

**Rationale**: Frontend тонкий — не вычисляет, только отображает. Логика классификации уже есть в `file_classification.py` (`classify_file_by_suffix` → `LineCategory` enum → `.value` string). Для treemap-фильтрации достаточно одной dominant category per file. `LineCategory` enum остаётся внутренней деталью odoo pipeline.

**Alternatives considered**:
- Frontend вычисляет из `line_counts` — отвергнуто (Q11): нарушение thin-frontend.
- Multi-category per file — избыточно для treemap, усложняет фильтрацию.

## R4: `EdgeBreakdown` в core — generic dict vs Odoo-specific struct

**Decision**: `EdgeBreakdown` в `core/contracts.py` перерабатывается на `breakdown: dict[str, int] | None` (keys=`relation_type_id`); `EdgeKind` enum остаётся внутри odoo pipeline.

**Rationale**: `EdgeBreakdown` в core contracts — domain-neutral контракт между core и storage/API. Odoo-specific kinds (`model_reuse`, `extension_or_method`, `view`, `field_property`) — деталь профиля, не должна утечь в generic-слой. `EdgeKind` enum остаётся в `value_objects.py` как внутренняя деталь odoo pipeline (согласовано с Principle III: `odoo` — расширение `python`). На выходе в storage/API enum маппится на string (`.value`). `CouplingEdge.evidence` удаляется (Q3) — evidence больше не используется UI и storage.

**Alternatives considered**:
- Удалить `EdgeKind` enum полностью — отвергнуто (Q25): Odoo-specific поля остаются в odoo pipeline, если не удаляются явно.
- Оставить `EdgeBreakdown` struct в core — нарушает generic-модель, противоречит Q20.

## R5: Endpoint strategy — удаление vs deprecated

**Decision**: Полное удаление user-facing endpoint’ов (`structure/timeseries`, `edge-kinds/timeseries`, `relations/diff`, `failures`, `depends`, `models`, `edge-evidence`, `edge-points`, `edge-points/batch`, `catalog`, `status`, `snapshot/modules`, `snapshot/files`) из `QueryMethod`/`_METHOD_TABLE`/FastAPI; CLI-команды и тесты обновляются/удаляются. `GET /api/graph` и `GET /api/commits` остаются (пути не меняются — REST API перерабатывается в отдельной задаче).

**Rationale**: Удаление мёртвого кода снижает площадь поддержки. CLI-команды (`edge-points`, `edge-evidence`, `structure-timeseries`, и т.д.) и тесты, зависящие от удалённых методов, обновляются под новую модель или удаляются. Пути endpoint'ов не принципиальны (REST API перерабатывается в отдельной задаче) — оставляем старые пути где удобно (`graph`, `commits`, `metrics/timeseries`, `hotspots`). Проекты пересобирают DuckDB с нуля (Q2), обратная совместимость storage не требуется.

**Alternatives considered**:
- Deprecated-метки — отвергнуты (Q4): сохраняет мёртвый код, противоречит minimal-surface.
- Thin proxy старых endpoint’ов поверх новых — добавляет код без пользы.

## R6: `TimeseriesResponse`/`HotspotsResponse` — generic переработка

**Decision**: Полная переработка на generic новую schema; `metric` → `metric_id`; special-case branch'и (`lines`, `lines_by_category`, `python_file_count`) удаляются из handler — catalog-driven dispatch.

**Rationale**: Единый catalog содержит mapping `metric_id → reader-method/scope`; handler получает `metric_id`, маппит на reader-method, отдаёт generic series/points. Frontend тонкий — передаёт только `metric_id`. `HotspotsResponse` получает `metric_id: str`; items уже generic (`name`/`current`/`first`/`growth`).

**Alternatives considered**:
- Переименовать `metric` → `metric_id`, оставить структуру — отвергнуто (Q18): пользователь выбрал полную переработку.
- Frontend-валидация `metric_id` — отвергнута: thin-frontend.

## R7: `GraphNodeResponse` — generic node contract

**Decision**: `GraphNodeResponse` перерабатывается на generic (`module_name: str`, `metrics: dict[str, float]`, `line_counts: dict[str, int]`); Odoo-specific поля удаляются; `ModuleDetailResponse`/`FileDetailResponse` удаляются.

**Rationale**: Graph nodes должны быть domain-neutral; `metrics`/`line_counts` JSON из storage напрямую питают node. Detail panels берут данные из `snapshot/table/*` rows — отдельных detail endpoints не нужно. `LineCategoriesResponse` удаляется (заменяется на `line_counts`); `MetricDistributionResponse` → generic `distributions: dict[str, MetricDistribution]`.

**Alternatives considered**:
- Оставить `GraphNodeResponse` с Odoo-specific полями — нарушает Q12/Q21.
- Отдельные detail endpoints — добавляют код без пользы (data уже в table rows).