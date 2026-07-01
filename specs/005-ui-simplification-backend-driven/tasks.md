---

description: "Task list for UI Simplification & Backend-Driven UI Model"
---

# Tasks: UI Simplification & Backend-Driven UI Model

**Input**: Design documents from `/specs/005-ui-simplification-backend-driven/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests included — constitution mandates typed contracts and explicit error handling; contract/parity tests already exist and must be updated.

**Organization**: Tasks grouped by user story (7 stories, P1→P3) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `src/ppi/` at repository root
- Frontend: `frontend/src/`
- VS Code extension: `vscode-extension/src/`
- Tests: `tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Storage schema migration, core contracts refactor, metric catalog — foundation for all user stories.

- [X] T001 Переработать storage schema на JSON-колонки (`metrics: JSON`, `line_counts: JSON`, `breakdown: JSON`, `kinds: JSON`) в `src/ppi/storage/schema.py`; удалить hardcoded колонки (`cc_*`, `cog_*`, `jones_*`, `score_in`, `score_out`, `python_file_count`, `declared_models_count`, `inherited_models_count`, `python_complexity_parse_errors`, `model_reuse`, `extension_or_method`, `view`, `field_property`); удалить таблицы `coupling_edge_evidence`, `module_manifest_depend`, `module_model`, `coupling_edge_kind`, `coupling_edge_breakdown` (`kinds`/`breakdown` хранятся inline как JSON-колонки в `coupling_edge`)
- [X] T002 [P] Переработать core contracts в `src/ppi/core/contracts.py`: `EdgeBreakdown` → удалить (заменить на `dict[str, int] | None` inline в `CouplingEdge.breakdown`); `CouplingEdge.evidence` удалить; `ModuleAggregate` — удалить Odoo-specific поля (`declared_models_count`, `inherited_models_count`, `python_complexity_parse_errors`, `score_in`, `score_out`, `declared_models`, `inherited_models`, `manifest_depends`), добавить `metrics: dict[str, float]`, `line_counts: dict[str, int]`
- [X] T002a [P] Переработать odoo snapshots в `src/ppi/core/odoo/snapshots.py`: `ModuleFacts` (определён здесь, не в `contracts.py`) — удалить Odoo-specific поля, которые не нужны внутри pipeline: `python_complexity_parse_errors` (используется только для UI); оставить `declared_models`, `inherited_models`, `manifest_depends` (нужны внутри odoo pipeline для извлечения relation rows в query layer, согласно принципу Q25: Odoo-specific поля остаются в odoo pipeline); добавить `metrics: dict[str, float]`, `line_counts: dict[str, int]`
- [X] T003 [P] Создать единый metric catalog модуль в `src/ppi/query/metric_catalog.py`: mapping `metric_id → (scope, reader_method, value_type, label, unit, format, default_enabled, weight)`; `scope` может быть `module`/`file`/`both` (для `both` catalog содержит `reader_method_module` и `reader_method_file` — handler выбирает по запрошенному `level`); питает `ui/config.dashboard_metrics` и валидацию `/metrics/timeseries`/`/hotspots`; содержит текущие метрики (`cyclomatic`, `cognitive`, `jones`, `python_file_count`, `lines`, `lines_by_category`, `jones_line_count`, `function_count`) — `jones_line_count` и `function_count` нужны для `FileDetailPanel` (AST/Jones measured lines, function count)
- [X] T004 [P] Удалить `LINE_CATEGORY_KEYS` из `src/ppi/core/odoo/pipeline.py` (заменить на динамический список ключей из `line_counts` JSON); `LineCategory` enum остаётся в `src/ppi/core/value_objects.py` (определён там, используется в `src/ppi/core/odoo/file_classification.py`) (odoo internal)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend infrastructure that MUST be complete before ANY user story UI work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Переработать storage writer в `src/ppi/storage/writer.py`: записывать `metrics`/`line_counts`/`breakdown`/`kinds` как JSON-колонки в `module_aggregate`/`file_metric`/`coupling_edge`; удалить writer для `coupling_edge_evidence`/`coupling_edge_breakdown`/`module_manifest_depend`/`module_model`/`coupling_edge_kind`; удалить writer для hardcoded колонок; `module_aggregate` пишет `metrics`/`line_counts`/`distributions` (JSON), `file_metric` пишет `line_category_id`/`metrics`/`line_counts`/`distributions` (JSON), `coupling_edge` пишет `kinds`/`breakdown` (JSON inline)
- [X] T006 Переработать storage queries в `src/ppi/storage/queries.py`: читать `metrics`/`line_counts`/`breakdown`/`kinds` из JSON-колонок; удалить `_manifest_depends_at_commit`/`edge_points`/`edge_evidence`/`structure_timeseries`/`edge_kind_timeseries`/`relations_diff`/`failures`/`depends`/`models` queries и queries к удалённым таблицам (`coupling_edge_evidence`/`coupling_edge_breakdown`/`module_manifest_depend`/`module_model`/`coupling_edge_kind`); добавить queries для `snapshot/table/modules`/`snapshot/table/files` (generic rows из JSON); вычислять `line_category_id` (dominant category) для файлов
- [X] T007 Переработать analysis_mappers в `src/ppi/core/analysis_mappers.py`: удалить evidence mapping из `edge_snapshot_to_contract()`; `EdgeBreakdown` → `dict[str, int]` (keys=relation_type_id из `EdgeKind.value`); Odoo-specific поля (`declared_models_count`, `inherited_models_count`, `python_complexity_parse_errors`, `score_in`, `score_out`) → generic `metrics`/`line_counts`; `manifest_depends` → relation rows mapping в query layer
- [X] T008 Переработать odoo snapshots в `src/ppi/core/odoo/snapshots.py`: маппить Odoo-specific поля на string `line_category_id`/`metrics`/`line_counts` на выходе; `LineCategory` enum остаётся internal
- [X] T009 Переработать odoo pipeline в `src/ppi/core/odoo/pipeline.py`: `manifest_depends` извлекаются из фактов (не из storage таблицы) для relation rows; `EdgeKind` enum остаётся (odoo internal), маппится на string; удалить `LINE_CATEGORY_KEYS` (T004); удалить `evidence_items`/`PipelineEvidence` collection (evidence больше не собирается)
- [X] T009a [P] Переработать odoo facts в `src/ppi/core/odoo/facts.py`: `EdgeBreakdown` → generic `dict[str, int]` (keys=relation_type_id из `EdgeKind.value`); `CouplingEdgeSnapshot.evidence` удалить (evidence больше не собирается); `EdgeFact` struct удалить; `has_evidence()` удалить; `CouplingEdgeSnapshot.breakdown` → `dict[str, int] | None`; переработать `src/ppi/core/odoo/edge_scoring.py`: `breakdown_from_kind_counts` → generic (возвращает `dict[str, int]` вместо `EdgeBreakdown`)
- [X] T010 [P] Переработать query schemas в `src/ppi/query/schemas.py`: добавить `UiOption`/`UiMetricOption`/`UiColumnDefinition`/`UiTableDefinition`/`UiGraphConfig`/`UiConfigResponse`/`GenericTableRow`/`GenericTableResponse`/`RelationRowResponse`/`RelationsResponse`/`ProjectInfoResponse`; переработать `GraphNodeResponse` (generic: `module_name`/`metrics`/`line_counts`), `EdgeResponse` (без evidence, `breakdown: dict[str, int] | None`), `TimeseriesResponse`/`TimeseriesSeriesResponse`/`TimeseriesPointResponse` (generic, `metric_id`), `HotspotsResponse`/`HotspotItemResponse` (generic, `metric_id`); удалить `ModuleSnapshotResponse`/`FileSnapshotResponse`/`EdgePointsResponse`/`EdgeEvidenceResponse`/`EdgeBreakdownResponse`/`LineCategoriesResponse`/`ModuleDetailResponse`/`FileDetailResponse`/`StructureTimeseriesResponse`/`EdgeKindSeriesResponse`/`RelationsDiffResponse`/`ManifestDependsResponse`/`ManifestDependItemResponse`/`FailuresResponse`/`FailureItemResponse`/`CatalogResponse`/`StatusResponse`/`RunFailureResponse`/`LastRunResponse`/`EvidenceResponse`/`EdgePointItemResponse`/`EdgePointsBatchResponse`/`EdgePointsMissingPairResponse`/`EdgesResponse`/`ModuleModelsResponse`/`ScopeResponse`
- [X] T011 Переработать query dispatch в `src/ppi/query/dispatch.py`: удалить `STRUCTURE_TIMESERIES`/`EDGE_POINTS`/`EDGE_POINTS_BATCH`/`EDGE_EVIDENCE`/`EDGE_KIND_TIMESERIES`/`RELATIONS_DIFF`/`FAILURES`/`DEPENDS`/`MODELS`/`CATALOG`/`STATUS`/`SNAPSHOT_MODULES`/`SNAPSHOT_FILES`/`SNAPSHOT_MODULE`/`SNAPSHOT_FILE`/`EDGES`; добавить `UI_CONFIG`/`SNAPSHOT_TABLE_MODULES`/`SNAPSHOT_TABLE_FILES`/`SNAPSHOT_RELATIONS`/`PROJECT_INFO`
- [X] T012 Переработать query handlers в `src/ppi/query/_handlers.py`: удалить `structure_timeseries`/`edge_points`/`edge_evidence`/`edge_kind_timeseries`/`relations_diff`/`manifest_depends`/`models`/`failures`/`snapshot_module`/`snapshot_file`/`edges` handlers; добавить `ui_config`, `snapshot_table_modules`/`snapshot_table_files` (generic rows из JSON), `snapshot_relations`, `project_info`; переработать `metrics_timeseries` на generic `metric_id`; переработать `hotspots` на generic `metric_id`
- [X] T013 [P] Переработать query requests в `src/ppi/query/requests.py`: удалить hardcoded metric validation sets; принимать generic `metric_id: str`
- [X] T014 Переработать FastAPI server в `src/ppi/server/api.py`: удалить routes `structure/timeseries`/`edge-points`/`edge-points/batch`/`edge-evidence`/`edge-kinds/timeseries`/`relations/diff`/`failures`/`depends`/`models`/`catalog`/`status`/`snapshot/modules`/`snapshot/files`/`snapshot/module`/`snapshot/file`/`edges`; добавить routes `ui/config`/`snapshot/table/modules`/`snapshot/table/files`/`snapshot/relations`/`project/info`; обновить `metrics/timeseries` route (`metric_id`), `hotspots` route (`metric_id`)
- [X] T015 Обновить CLI в `src/ppi/cli/main.py`: удалить команды `edge-points`/`edge-evidence`/`structure-timeseries`/`edge-kinds-timeseries`/`relations-diff`/`failures`/`depends`/`models`/`catalog`/`status`/`edges`; обновить `snapshot/table/modules` (вместо `snapshot/modules`), `snapshot/table/files` (вместо `snapshot/files`); добавить `ui/config`/`snapshot/relations`/`project/info` CLI commands; обновить `metrics-timeseries`/`hotspots` commands — передают `metric_id: str` (вместо `metric`)
- [X] T016 Обновить vscode-extension allowed methods в `vscode-extension/src/webviewPanel.ts`: заменить `snapshot/modules`/`snapshot/files` на `snapshot/table/modules`/`snapshot/table/files`; удалить `edge-points`/`edge-evidence`/`structure/timeseries`/`edge-kinds/timeseries`/`relations/diff`/`failures`/`depends`/`models`/`catalog`/`status`

**Checkpoint**: Backend foundation ready — `ui/config`, `snapshot/table/*`, `snapshot/relations`, `project/info` endpoints работают; storage на JSON-колонках; core contracts generic; metric catalog единый источник.

---

## Phase 3: User Story 1 — Backend-driven UI configuration (Priority: P1) 🎯 MVP

**Goal**: Frontend получает все опции UI (категории, метрики, типы связей, колонки, агрегации) из единого `ui/config` endpoint; удаляет все жестко закодированные доменные константы.

**Independent Test**: `GET /api/ui/config` отдаёт конфигурацию; frontend рендерит UI без импортов `LINE_CATEGORIES`/`BRIGHTNESS_CRITERIA`/`GRAPH_BREAKDOWN_KINDS`/`EDGE_KIND_LABELS`.

### Implementation for User Story 1

- [X] T017 [P] [US1] Добавить frontend типы `UiOption`/`UiMetricOption`/`UiColumnDefinition`/`UiTableDefinition`/`UiGraphConfig`/`UiConfigResponse` в `frontend/src/api/client.ts` (или `frontend/src/api/uiConfig.ts`)
- [X] T018 [P] [US1] Добавить `fetchUiConfig(): Promise<UiConfigResponse>` и zod schemas в `frontend/src/api/client.ts` и `frontend/src/api/schemas.ts`
- [X] T019 [US1] Удалить доменные константы из `frontend/src/registry/odooProfile.ts`: `LINE_CATEGORIES`/`DEFAULT_LINE_CATEGORIES`/`BRIGHTNESS_CRITERIA`/`DEFAULT_BRIGHTNESS_CRITERIA`/`GRAPH_BREAKDOWN_KINDS`/`EDGE_KIND_LABELS`/`NON_SCORING_EDGE_KINDS`/`isScoringEdgeKind()`/`edgeKindLabel()`/`graphBreakdownKindMeta()`/`graphNodeMetricValue()`; оставить только generic helpers без Odoo id
- [X] T020 [US1] Добавить `uiConfig` state в `frontend/src/pages/SnapshotPage.tsx`: загружать через `fetchUiConfig()`; инициализировать line categories и brightness criteria из `uiConfig.graph.*.default_enabled`; обрабатывать ошибку загрузки (empty/error state, не падать) — edge case: `ui/config` недоступен
- [X] T020a [P] [US1] Добавить обработку пустых списков в `frontend/src/components/LineCategoryToolbar.tsx`, `frontend/src/components/BrightnessToolbar.tsx`, `frontend/src/components/GraphSettingsPanel.tsx`: если `uiConfig.graph.*` пустые, рендерить пустые списки без ошибок — edge case: конфигурация UI не содержит ни одной категории/метрики

**Checkpoint**: Frontend загружает `ui/config` и рендерит опции без доменных констант.

---

## Phase 4: User Story 2 — Упрощённая навигация: два раздела (Priority: P1)

**Goal**: Верхняя навигация содержит только `Report` и `Dashboard`; вкладки `Structure`/`Analytics`/`Status` удалены.

**Independent Test**: В UI отсутствуют тексты `Structure`/`Структура`/`Analytics`/`Аналитика`/`Status`/`Статус` как top-level вкладки.

### Implementation for User Story 2

- [X] T021 [P] [US2] Изменить `frontend/src/navigation.tsx`: `AppTab = "snapshot" | "dashboard"`; удалить `structure`/`analytics`/`status` из state/logic; `SnapshotTab = "lines" | "relations" | null`
- [X] T022 [US2] Изменить `frontend/src/App.tsx`: удалить imports `AnalyticsPage`/`StructurePage`/`StatusPage`; удалить tabs `tabs.structure`/`tabs.analytics`/`tabs.status`; оставить `snapshot`/`Report` и `dashboard`/`Dashboard`
- [X] T023 [P] [US2] Удалить файлы `frontend/src/pages/StructurePage.tsx`, `frontend/src/pages/AnalyticsPage.tsx`, `frontend/src/pages/StatusPage.tsx`
- [X] T024 [P] [US2] Удалить `frontend/src/transforms/structureTransforms.ts`
- [X] T024a [P] [US2] Удалить `frontend/src/transforms/analyticsTransforms.ts` (используется только `AnalyticsPage` (удаляется T023) и тестами; тесты обновляются в T065)
- [X] T024b [P] [US2] Переработать `frontend/src/transforms/timeseriesChart.ts`: удалить hardcoded `LINE_CATEGORIES`/`CHART_CATEGORY_COLORS`/`edgeKindLabel`; derive series из `ui/config` или generic response (используется `dashboardTransforms.ts` через `categoryChartFromTimeseries`)
- [X] T025 [P] [US2] Удалить i18n ключи `tabs.structure`/`tabs.analytics`/`tabs.status` из `frontend/src/locales/**` и `frontend/src/i18n/**`

**Checkpoint**: Навигация содержит только `Report` и `Dashboard`.

---

## Phase 5: User Story 3 — Упрощённый Report: graph + treemap + две таблицы (Priority: P1)

**Goal**: Report содержит graph + treemap + иерархическую таблицу модулей/файлов + relations table; удалены accordion-блоки `Parse failures`/`Python file complexity`/`Manifest depends` и колонка `Evidence`.

**Independent Test**: На странице Report нет блоков `Parse failures`/`Python file complexity`/`Manifest depends`/`Evidence`; есть drilldown модули→файлы.

### Implementation for User Story 3

- [X] T026 [US3] Упростить `frontend/src/pages/SnapshotPage.tsx`: удалить imports `fetchFailures`/`ManifestDependsView`/`ParseFailureView`/`FileComplexityTable`/`LINE_CATEGORIES`/`DEFAULT_LINE_CATEGORIES`/`BRIGHTNESS_CRITERIA`/`DEFAULT_BRIGHTNESS_CRITERIA`/`BrightnessCriterion`/`LineCategoryKey`; удалить вызов `fetchFailures` и state `failures`; удалить `setFailures([])`; заменить `fetchStatus` на `fetchProjectInfo`; оставить accordion `lines` и `relations`
- [X] T027 [P] [US3] Переработать `frontend/src/components/LineCategoryToolbar.tsx`: props `options: readonly UiOption[]`/`active: ReadonlySet<string>`/`onChange`; рендерить `options.map(...)`, удалить `lineCategoryLabel()` switch
- [X] T028 [P] [US3] Переработать `frontend/src/components/BrightnessToolbar.tsx`: props `options: readonly UiMetricOption[]`/`active: ReadonlySet<string>`/`onChange`; удалить `brightnessLabel()` hardcoded labels
- [X] T029 [P] [US3] Переработать `frontend/src/components/GraphSettingsPanel.tsx`: edge kind meta/node size metric options/link thickness metric options из `uiConfig.graph`; `enabledEdgeKinds: Record<string, boolean>`, `nodeSizeMetric: string`, `linkThicknessMetric: string` (без Odoo-specific union)
- [X] T030 [P] [US3] Переработать `frontend/src/components/graphSettingsTypes.ts`: `enabledEdgeKinds: Record<string, boolean>`, `nodeSizeMetric: string`, `linkThicknessMetric: string` (без Odoo-specific union)
- [X] T031 [US3] Переработать `frontend/src/components/ModuleGraph.tsx`: `brightnessCriteria: ReadonlySet<string>` (вместо `BrightnessCriterion`), `lineCategories: ReadonlySet<string>` (вместо `LineCategoryKey`); line totals из `node.line_counts[categoryId]`; brightness через generic metric values по metric id; без switch/case по metric ids
- [X] T032 [P] [US3] Переработать `frontend/src/components/graphViewModel.ts` и `frontend/src/components/graphSelectors.ts`: node brightness/size/link thickness по id из config; если metric id неизвестен — `0`; edge labels из config/backend label
- [X] T033 [US3] Переработать `frontend/src/components/FileTreemap.tsx`: generic `line_category_id` (string), убрать type cast к Odoo-specific union; фильтрация по `line_category_id` из `ui/config`
- [X] T034 [US3] Переработать `frontend/src/transforms/treemapTransforms.ts`: breadcrumb/legend не показывает служебный сегмент `.`; если root-level folder равен `.`, не добавляется в breadcrumb/legend
- [X] T035 [US3] Заменить `ModuleLinesTable` + `FileComplexityTable` на `SnapshotEntityTable`/`HierarchicalSnapshotTable` в `frontend/src/components/ReportTables.tsx`: уровень 1 — модули (колонки из `snapshot/table/modules`), кнопка `Files`; уровень 2 — файлы выбранного модуля (колонки из `snapshot/table/files`), кнопка `Back to modules`; generic rows из `GenericTableResponse`; удалить hardcoded `LINE_CATEGORIES`/`Cyclomatic`/`Cognitive`/`Jones`
- [X] T036 [US3] Заменить `EdgePointsTable` на generic `RelationsTable` в `frontend/src/components/ReportTables.tsx`: строки из `RelationsResponse`; columns из `ui/config.tables.relations`; нет колонки `Evidence`/Odoo-specific category list/hardcoded `edgeKindLabel()`
- [X] T037 [P] [US3] Удалить `frontend/src/components/ManifestDependsView.tsx`, `frontend/src/components/ParseFailureView.tsx`, `frontend/src/components/EvidenceStack.tsx`
- [X] T038 [P] [US3] Удалить `frontend/src/transforms/reportTransforms.ts` (используется только `ReportTables.tsx` для `buildKindRows`/`KindRow` — заменяется на generic `RelationsTable`; тест `transforms.test.ts` обновляется в T065)
- [X] T039 [P] [US3] Переработать `frontend/src/transforms/snapshotTransforms.ts`: generic (без `breakdown` Odoo-specific, без `evidence`)
- [X] T040 [P] [US3] Добавить `fetchProjectInfo()` в `frontend/src/api/client.ts` и zod schema в `frontend/src/api/schemas.ts`; `SnapshotPage` вызывает вместо `fetchStatus`
- [X] T041 [P] [US3] Удалить `fetchFailures`/`fetchStructureTimeseries`/`fetchRelationsDiff`/`fetchEdgeKindTimeseries`/`fetchEdgePointsBatch`/`fetchEdges`/`fetchCatalog`/`fetchStatus`/`fetchSnapshotModules`/`fetchSnapshotFiles` из `frontend/src/api/client.ts`; удалить соответствующие zod schemas из `frontend/src/api/schemas.ts`; добавить `fetchSnapshotTableModules`/`fetchSnapshotTableFiles`/`fetchSnapshotRelations`

**Checkpoint**: Report упрощён — graph + treemap + иерархическая таблица + relations table; нет лишних блоков.

---

## Phase 6: User Story 4 — Упрощённые detail panel’и (Priority: P2)

**Goal**: ModuleDetailPanel показывает только name/metrics/line_counts; FileDetailPanel без `Parse error`/`Top folder`/`Category`/`Lines`.

**Independent Test**: В карточках нет перечисленных технических полей.

### Implementation for User Story 4

- [X] T042 [US4] Переработать `frontend/src/components/ModuleDetailPanel.tsx`: props `module: ModuleSnapshot | null`/`activeMetricIds: ReadonlySet<string>`/`metricOptions: readonly UiMetricOption[]`/`lineCategoryOptions: readonly UiOption[]`; отображать только: название, активные метрики яркости и их значения (из `module.metrics[metricId]`), количество строк файлов по категориям (из `module.line_counts[categoryId]`); удалить `method count`/`code lines`/`python file count`/`total lines`/`score in`/`score out`/outgoing/incoming edges/private calls/parse errors/declared models/inherited models/manifest depends
- [X] T043 [US4] Переработать `frontend/src/components/FileDetailPanel.tsx`: удалить отображение `Parse error`/`Top folder`/`Category`/`Lines` в нижней строке; оставить путь/заголовок, функции, распределения сложности, AST/Jones measured lines

**Checkpoint**: Detail panel’и упрощены.

---

## Phase 7: User Story 5 — Generic relations table (Priority: P2)

**Goal**: Manifest-зависимости представлены как relation rows с `relation_type_id = "manifest_depends"` через `GET /api/snapshot/relations`.

**Independent Test**: `GET /api/snapshot/relations` возвращает manifest-зависимости как relation rows.

### Implementation for User Story 5

- [X] T044 [P] [US5] Backend: реализовать `snapshot_relations` handler в `src/ppi/query/_handlers.py`: собирает relation rows из `coupling_edge` (kinds/breakdown JSON) + manifest_depends из фактов (не из storage таблицы); маппит в `RelationRowResponse` (`source_id`/`source_label`/`target_id`/`target_label`/`relation_type_id`/`relation_type_label`/`strength_metric_id`/`strength_metric_label`/`strength_value`); `relation_type_label` из `ui/config.graph.edge_types`
- [X] T045 [P] [US5] Backend: реализовать query для relations в `src/ppi/storage/queries.py`: читать `coupling_edge` (kinds/breakdown JSON) + manifest facts; маппить в generic relation rows; `include_zero_score` filter
- [X] T046 [US5] Frontend: `RelationsTable` в `frontend/src/components/ReportTables.tsx` (T036) рендерит rows из `fetchSnapshotRelations`; columns из `ui/config.tables.relations`

**Checkpoint**: Manifest-зависимости в единой relations table.

---

## Phase 8: User Story 6 — Backend-driven Dashboard selectors (Priority: P2)

**Goal**: Dashboard получает metric options из `ui/config.dashboard_metrics` и aggregations из `ui/config.aggregations`; нет hardcoded `COMPLEXITY_METRICS`/`MODULE_METRICS`/`AGGS`.

**Independent Test**: `DashboardPage.tsx` не содержит hardcoded метрик/агрегаций.

### Implementation for User Story 6

- [X] T047 [US6] Переработать `frontend/src/pages/DashboardPage.tsx`: удалить `COMPLEXITY_METRICS`/`MODULE_METRICS`/`AGGS`; metric options из `uiConfig.dashboard_metrics`; aggregation options из `uiConfig.aggregations`; `fetchHotspots`/`fetchMetricsTimeseries` передают `metric_id` (string)
- [X] T048 [P] [US6] Переработать `frontend/src/transforms/dashboardTransforms.ts`: generic (без hardcoded metric names)
- [X] T049 [US6] Обновить `frontend/src/api/client.ts`: `fetchMetricsTimeseries`/`fetchHotspots` передают `metric_id: string` (вместо `metric`); обновить zod schemas в `frontend/src/api/schemas.ts` под generic `TimeseriesResponse`/`HotspotsResponse`

**Checkpoint**: Dashboard selectors backend-driven.

---

## Phase 9: User Story 7 — Backend cleanup: endpoint’ы и evidence (Priority: P3)

**Goal**: Удалённые endpoint’ы возвращают 404; CLI-команды и тесты обновлены; evidence не собирается.

**Independent Test**: `curl /api/structure/timeseries` → 404; `pytest tests/` проходит.

### Tests for User Story 7

- [X] T050 [P] [US7] Обновить `tests/contract/test_query_dispatch_parity.py`: удалить parity для `structure/timeseries`/`edge-points`/`edge-points/batch`/`edge-evidence`/`edge-kinds/timeseries`/`relations/diff`/`failures`/`depends`/`models`/`catalog`/`status`/`snapshot/modules`/`snapshot/files`; добавить parity для `ui/config`/`snapshot/table/modules`/`snapshot/table/files`/`snapshot/relations`/`project/info`
- [X] T051 [P] [US7] Обновить `tests/contract/test_restored_http_contract.py`: удалить edge-points/edge-evidence/relations-diff/failures/depends/models/catalog/status тесты; добавить ui/config/snapshot-table/relations/project-info тесты
- [X] T052 [P] [US7] Обновить `tests/contract/test_http_api.py`: удалить structure/timeseries; обновить graph (generic contract); обновить commits (без изменений)
- [X] T053 [P] [US7] Обновить `tests/contract/test_snapshot_reads.py`: `snapshot/modules` → `snapshot/table/modules`; `snapshot/files` → `snapshot/table/files`
- [X] T054 [P] [US7] Обновить `tests/integration/test_dashboard_api.py`: удалить structure/status; `catalog` → `ui/config`; обновить metrics timeseries (`metric_id`)
- [X] T055 [P] [US7] Обновить `tests/integration/test_edge_inclusion.py`: удалить `structure/timeseries` usage
- [X] T056 [P] [US7] Обновить `tests/integration/test_snapshot_parity.py`: `snapshot/modules` → `snapshot/table/modules`; graph generic contract
- [X] T057 [P] [US7] Обновить `tests/integration/test_quickstart_flow.py`: `status` → `project/info`; `catalog` → `ui/config`
- [X] T058 [P] [US7] Обновить `tests/unit/test_facts.py`: `EdgeBreakdown` → `dict[str, int]`; удалить Odoo-specific fields
- [X] T059 [P] [US7] Обновить `tests/unit/test_restored_metrics.py`: `EdgeBreakdown` → `dict`; обновить metric assertions
- [X] T060 [P] [US7] Обновить `tests/unit/test_pure_modules.py`: `breakdown_from_kind_counts` → generic; обновить `EdgeBreakdown` references
- [X] T061 [P] [US7] Обновить `tests/contract/test_store_writer_v2.py`: JSON-колонки запись; удалить evidence/manifest_depends/model writes
- [X] T062 [P] [US7] Обновить `tests/contract/test_store_schema.py`: JSON-колонки; удалить `coupling_edge_evidence`/`module_manifest_depend`/`module_model`/`coupling_edge_kind`/`coupling_edge_breakdown` table assertions; добавить `metrics`/`line_counts`/`breakdown`/`kinds` JSON-колонки assertions
- [X] T063 [P] [US7] Обновить `tests/integration/test_restored_store.py`: JSON-колонки чтение (`metrics`/`line_counts`/`breakdown`/`kinds`); удалить `coupling_edge_breakdown`/`coupling_edge_kind` hardcoded columns assertions

### Implementation for User Story 7

- [X] T064 [US7] Удалить i18n ключи `snapshot.sections.fileComplexity`/`snapshot.sections.manifestDepends`/`snapshot.sections.parseFailures` + labels для hardcoded line categories/brightness metrics/edge kinds (если labels приходят из backend) из `frontend/src/locales/**` и `frontend/src/i18n/**`
- [X] T065 [US7] Обновить frontend tests: `frontend/src/transforms/transforms.test.ts` (удалить `EdgeBreakdown`/`Evidence`/`breakdown` hardcoded, обновить generic), `frontend/src/domain/domain.test.ts` (удалить `StatusResponseSchema`/`GraphBreakdownKind`), `frontend/src/api/dataSource.test.ts` (обновить paths: `snapshot/table/*`), `frontend/src/domain/errors.test.ts` (обновить)
- [X] T066 [US7] Обновить vscode-extension tests: `vscode-extension/test/dashboard.test.ts` (graph generic), `vscode-extension/test/unit/errors.test.ts`, `vscode-extension/test/unit/webviewMessages.test.ts`

**Checkpoint**: Все тесты проходят; удалённые endpoint’ы → 404.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Финальная проверка и cleanup.

- [X] T067 [P] Run quickstart.md validation scenarios 1-11 из `specs/005-ui-simplification-backend-driven/quickstart.md`
- [X] T068 [P] Code cleanup: удалить неиспользуемые imports/exports в frontend после удаления страниц/компонентов
- [X] T069 [P] Проверить отсутствие hardcoded доменных констант в frontend: `grep -r 'LINE_CATEGORIES\|BRIGHTNESS_CRITERIA\|GRAPH_BREAKDOWN_KINDS\|EDGE_KIND_LABELS\|COMPLEXITY_METRICS\|MODULE_METRICS\|AGGS' frontend/src/ --include='*.ts' --include='*.tsx'`
- [X] T070 [P] Проверить DuckDB schema: JSON-колонки (`metrics`/`line_counts`/`breakdown`/`kinds`) присутствуют; `coupling_edge_evidence`/`module_manifest_depend`/`module_model`/`coupling_edge_kind`/`coupling_edge_breakdown` отсутствуют; hardcoded колонки удалены
- [X] T071 [P] Проверить удалённые endpoint’ы → 404 (structure/timeseries, edge-points, failures, catalog, status, snapshot/modules, snapshot/files)
- [X] T072 [P] Запустить `uv run pytest tests/ -x` и `cd frontend && npm test`; все тесты проходят

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — storage schema + core contracts + metric catalog
- **Foundational (Phase 2)**: Depends on Phase 1 (schema/contracts) — BLOCKS all user stories; writer/queries/handlers/dispatch/server/CLI/vscode-extension
- **User Stories (Phase 3-9)**: All depend on Foundational (Phase 2) completion
  - US1 (Phase 3): `ui/config` frontend — foundational for all UI work
  - US2 (Phase 4): navigation cleanup — independent of US1
  - US3 (Phase 5): Report simplification — depends on US1 (`uiConfig` state) for toolbars/graph settings
  - US4 (Phase 6): detail panels — depends on US3 (SnapshotPage context)
  - US5 (Phase 7): relations table — backend handler + frontend; depends on US3 (ReportTables)
  - US6 (Phase 8): Dashboard — depends on US1 (`fetchUiConfig`)
  - US7 (Phase 9): tests + cleanup — depends on all previous stories
- **Polish (Phase 10)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependencies on other stories
- **US2 (P1)**: After Foundational — independent (can parallel with US1)
- **US3 (P1)**: After Foundational + US1 (`uiConfig` state for toolbars/settings)
- **US4 (P2)**: After US3 (SnapshotPage context)
- **US5 (P2)**: After US3 (ReportTables component)
- **US6 (P2)**: After US1 (`fetchUiConfig`)
- **US7 (P3)**: After all previous stories

### Within Each User Story

- Models/schemas before services/handlers
- Backend handlers before frontend components
- Core implementation before integration
- Tests in US7 (after implementation)

### Parallel Opportunities

- Setup tasks T002-T004 marked [P] (different files)
- Foundational tasks T010/T013 marked [P] (different files)
- US1 tasks T017-T018 marked [P] (different files)
- US2 tasks T021-T025 marked [P] (different files, independent deletions)
- US3 tasks T027-T032, T033-T034, T037-T041 marked [P] (different files)
- US5 tasks T044-T045 marked [P] (backend, different files)
- US7 test tasks T050-T063 marked [P] (different test files)

---

## Parallel Example: User Story 2 (Navigation cleanup)

```bash
# Launch all independent deletions together:
Task T021: "navigation.tsx — AppTab type"
Task T023: "Delete StructurePage.tsx"
Task T024: "Delete structureTransforms.ts"
Task T025: "Delete i18n keys"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (storage/contracts/catalog)
2. Complete Phase 2: Foundational (writer/queries/handlers/server/CLI)
3. Complete Phase 3: US1 (`ui/config` frontend)
4. Complete Phase 4: US2 (navigation cleanup)
5. **STOP and VALIDATE**: `ui/config` works; navigation simplified

### Incremental Delivery

1. Setup + Foundational → Backend foundation ready
2. US1 + US2 → MVP (ui/config + navigation)
3. US3 → Report simplification (graph + treemap + tables)
4. US4 → Detail panels
5. US5 → Relations table
6. US6 → Dashboard selectors
7. US7 → Tests + cleanup
8. Polish → Final validation

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (ui/config frontend) + US3 (Report)
   - Developer B: US2 (navigation) + US6 (Dashboard)
   - Developer C: US5 (relations backend) + US7 (tests)
3. US4 after US3; US7 after all

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Backend work (Phase 1-2) blocks all UI work; UI work (Phase 3-9) can parallel after Foundational
- Tests in US7 (Phase 9) — after implementation, not TDD (constitution mandates typed contracts but tests updated post-implementation for this refactor)