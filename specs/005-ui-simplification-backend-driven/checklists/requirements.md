# Specification Quality Checklist: UI Simplification & Backend-Driven UI Model

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-30
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Спецификация основана на детальном исходном документе `ui_005_simplification_backend_driven_spec.md`, который уже содержал конкретные контракты (`UiConfigResponse`, `RelationRowResponse`) и список затрагиваемых файлов. Эти имена контрактов и endpoint’ов описаны как WHAT (целевые контракты), а не HOW (реализация), и соответствуют источнику требований пользователя.
- Сессия clarification 2026-06-30: 25 вопросов задано и интегрировано. Ключевые решения:
  - Storage: JSON-колонки (`metrics`, `line_counts`, `breakdown`, `kinds`) в существующих таблицах; hardcoded колонки удаляются; таблицы `coupling_edge_evidence`/`module_manifest_depend`/`module_model`/`coupling_edge_kind`/`coupling_edge_breakdown` удаляются (kinds/breakdown хранятся inline как JSON-колонки в `coupling_edge`); проекты пересобирают DuckDB с нуля.
  - Core: `evidence` удаляется из `CouplingEdge` и `analysis_mappers`; `EdgeBreakdown` → generic `dict[str, int]`; `LineCategory`/`EdgeKind` enums остаются внутри odoo pipeline (внутренняя деталь профиля), маппятся на string на выходе; `LINE_CATEGORY_KEYS` удаляется.
  - API endpoints: `ui/config` (новый, generic), `snapshot/table/modules`/`snapshot/table/files` (новые, заменяют `snapshot/modules`/`snapshot/files`), `snapshot/relations` (новый), `project/info` (новый); удаляются `structure/timeseries`, `edge-kinds/timeseries`, `relations/diff`, `failures`, `depends`, `models`, `edge-evidence`, `edge-points`, `edge-points/batch`, `catalog`, `status`; `graph` и `commits` остаются без изменений путей.
  - Response models: `ModuleSnapshotItemResponse` → generic (`metrics`, `line_counts`); `FileSnapshotItemResponse` → `line_category_id` (backend-computed), без `top_folder`/`parse_error`/`category`/`lines`; `GraphNodeResponse` → generic; `EdgeResponse` без evidence, `breakdown: dict[str, int]`; `TimeseriesResponse`/`HotspotsResponse` → generic; `ModuleDetailResponse`/`FileDetailResponse`/`EdgePointsResponse`/`EdgeEvidenceResponse`/`LineCategoriesResponse` удаляются; `MetricDistributionResponse` → generic `distributions: dict[str, MetricDistribution]`.
  - Frontend: тонкий, логика на backend; `AGGS` → из `ui/config.aggregations`; `COMPLEXITY_METRICS`/`MODULE_METRICS` → из `ui/config.dashboard_metrics`; metric catalog единый источник для `ui/config` и валидации `/metrics/timeseries`/`/hotspots`; special-case branch'и в handler удаляются (catalog-driven dispatch).
  - Принципы: Odoo-specific поля остаются в odoo pipeline, если не удаляются явно (evidence); пути endpoint'ов не меняются (REST API перерабатывается в отдельной задаче); оставляемые endpoint'ы без generic-переработки не трогаются.
- Сессия analyze 2026-06-30: 8 finding'ов исправлено (F1: US7 acceptance scenarios — deprecated→deleted; F2: US7 description — deprecated removed; F3: module_model added to FR-040; F4: coupling_edge_kind table removed, kinds inline JSON; F5: response columns mirror config; F6+F7: edge-case tasks added T020/T020a; F8: FRs renumbered FR-001..FR-044 sequentially).
- Все элементы прошли валидацию; доработок не требуется.
- Спецификация готова к `/speckit.implement`.