# Feature Specification: UI Simplification & Backend-Driven UI Model

**Feature Branch**: `005-ui-simplification-backend-driven`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "давай сделаем доработку согласно по требованиям согласно данному документу" (источник: `ui_005_simplification_backend_driven_spec.md`)

## Clarifications

### Session 2026-06-30

- Q: Вводим ли новые generic table endpoints в этом патче или оставляем frontend-адаптер поверх существующих snapshot endpoints? → A: Ввести новые endpoints `GET /api/snapshot/table/modules` и `GET /api/snapshot/table/files` с `GenericTableResponse` в этом патче.
- Q: Оставляем ли физически таблицы `coupling_edge_evidence` и `module_manifest_depend` в DuckDB и writer, или удаляем writer-код/schema в этом патче? → A: Полностью удаляем writer-код и schema для `coupling_edge_evidence` и `module_manifest_depend` в этом патче; проекты пересобирают DuckDB с нуля.
- Q: Удаляем ли поле `evidence` из `CouplingEdge` (core contracts) и mapping в `analysis_mappers` в этом патче, или оставляем в core, но не отдаём в API? → A: Удалить поле `evidence` из `CouplingEdge` и mapping в `analysis_mappers.edge_snapshot_to_contract()` в этом патче.
- Q: Удаляем ли user-facing API-методы (`structure/timeseries`, `edge-kinds/timeseries`, `relations/diff`, `failures`, `depends`, `models`, `edge-evidence`, `edge-points`, `edge-points/batch`) из `QueryMethod`/`_METHOD_TABLE`/FastAPI полностью, или помечаем deprecated и оставляем для CLI/tests? → A: Удалить полностью; обновить/удалить зависящие CLI-команды и тесты в этом патче.
- Q: Удаляем ли Odoo-specific поля (`declared_models`, `inherited_models`, `manifest_depends`, `python_complexity_parse_errors`, `score_in`, `score_out`) из `ModuleSnapshotItemResponse`, core contracts, storage schema, writer, analysis_mappers, odoo pipeline полностью в этом патче, или оставляем в payload для compatibility? → A: Удалить из response model, `ModuleAggregate` (core contracts), storage schema, writer, analysis_mappers; `declared_models`/`inherited_models`/`manifest_depends` остаются в `ModuleFacts` (odoo pipeline internal, нужны для извлечения relation rows — принцип Q25); `python_complexity_parse_errors` удаляется из `ModuleFacts` (только для UI); ввести generic `metrics: dict[str, float]` и `line_counts: dict[str, int]`.
- Q: Удаляем ли `top_folder`, `parse_error`, `category`, `lines` из `FileSnapshotItemResponse` полностью, или оставляем `category`/`lines` для treemap? → A: Удалить все четыре поля полностью; treemap и timeseries переводятся на generic `line_category_id` (значения строк приходят через `line_counts` модуля/файла).
- Q: Удаляем ли `EdgeResponse`, `EdgePointsResponse`, `EdgeEvidenceResponse` и связанные evidence-поля из schemas/dispatch/handlers полностью в этом патче? → A: Удалить `EdgePointsResponse`/`EdgeEvidenceResponse` и evidence-поля (`evidence_count`, `why_points`, `source_quote`) из `EdgeResponse`; `EdgeResponse` оставить для graph endpoint без evidence.
- Q: Использовать `ui/config.dashboard_metrics` или ввести отдельный `/api/metrics/catalog` как источник metric options для Dashboard? → A: Использовать `ui/config.dashboard_metrics` как единственный источник; отдельный `/api/metrics/catalog` не вводится.
- Q: Откуда приходят aggregation options (`AGGS`: mean/median/p95/max) для Dashboard — оставить frontend-defined или отдавать из backend? → A: Ввести общий `aggregations: list[UiOption]` в `UiConfigResponse`; frontend получает aggregation options из backend (тонкий frontend).
- Q: Заменяем ли `snapshot/modules` и `snapshot/files` на `snapshot/table/modules`/`snapshot/table/files` полностью, или оставляем старые endpoints? → A: Заменить полностью: удалить `snapshot/modules`/`snapshot/files` и их response models; vscode-extension и tests переходят на `snapshot/table/*`.
- Q: Откуда файл получает `line_category_id` для treemap — frontend вычисляет из `line_counts`, или backend добавляет поле? → A: Backend добавляет `line_category_id: str` в `FileSnapshotItemResponse` (dominant category per file); frontend тонкий, логика на backend.
- Q: Заменяем ли `GET /api/graph` новым generic endpoint, или оставляем и обновляем contract? → A: Оставить `GET /api/graph`, обновить node/edge contract на generic (`metrics`, `line_counts`, `relation_type_id`/`label`); `EdgeResponse` без evidence. Пути endpoint'ов пока не принципиальны — REST API перерабатывается в отдельной задаче, оставляем старые пути.
- Q: Оставить ли `GET /api/catalog` и `GET /api/status`, или удалить? → A: Удалить оба полностью; имена для Dashboard берутся из `snapshot/table/*` rows + `ui/config`, status-диагностика переходит на CLI `doctor`.
- Q: Что заменяет `fetchStatus` в `SnapshotPage` (он использует `project_id`/`repo_path`)? → A: Ввести новый `GET /api/project/info` для project metadata (`project_id`, `repo_path`); `SnapshotPage` вызывает его вместо `fetchStatus`; `run_failures` удаляются из UI.
- Q: Откуда backend берёт список валидных `metric_id` для валидации `/metrics/timeseries` и `/hotspots`? → A: Backend валидирует `metric_id` против единого metric catalog (того же, что питает `ui/config.dashboard_metrics`); hardcoded set в `_handlers.py`/`requests.py` удаляется.
- Q: Оставить ли `GET /api/commits`? → A: Оставить без изменений (нужен SnapshotPage, vscode-extension, tests). Endpoint'ы, которые остаются и не требуют generic-переработки, не трогаем.
- Q: Объединяем ли special-case branch'и в `metrics_timeseries` (`lines`, `lines_by_category`, `python_file_count`) в generic catalog-driven dispatch, или оставляем? → A: Объединить в generic: catalog содержит mapping `metric_id` → reader-method/scope; special-case branch'и удаляются из handler.
- Q: `TimeseriesResponse`/`TimeseriesSeriesResponse` — переименовать `metric` → `metric_id` или полностью переработать на generic? → A: Полностью переработать на generic новую schema (новая структура, backend-driven, тонкий frontend).
- Q: `HotspotsResponse` — generic или обновить? → A: Переработать на generic: добавить `metric_id: str`, убрать hardcoded validation set; items уже generic (`name`/`current`/`first`/`growth`).
- Q: `EdgeBreakdownResponse` (Odoo-specific kinds: `model_reuse`, `extension_or_method`, `view`, `field_property`) — удалить или сделать generic? → A: Заменить на generic `breakdown: dict[str, int]` в `EdgeResponse` (keys=`relation_type_id` из config); storage таблица `coupling_edge_breakdown` удаляется (breakdown хранится inline как JSON-колонка в `coupling_edge`); frontend использует config labels.
- Q: `GraphNodeResponse` (Odoo-specific: `python_file_count`, `method_count`, `cyclomatic_median`, `score_in/out`) и `ModuleDetailResponse`/`FileDetailResponse` — переработать или удалить? → A: `GraphNodeResponse` перерабатывается на generic (`module_name`, `metrics: dict[str, float]`, `line_counts: dict[str, int]`); `ModuleDetailResponse`/`FileDetailResponse` удаляются (detail panels берут данные из `snapshot/table/*` rows, отдельных detail endpoints не нужно).
- Q: Формат хранения метрик в DuckDB — generic EAV-таблицы или JSON-колонки? → A: JSON-колонки (`metrics: JSON`, `line_counts: JSON`, `breakdown: JSON`) в существующих таблицах (`module_aggregate`, `file_metric`, `coupling_edge`); hardcoded колонки (`cc_*`, `cog_*`, `jones_*`, `score_in`, `score_out`, `python_file_count`) удаляются; проекты пересобирают DuckDB.
- Q: Удалять ли `LineCategory` enum и `LINE_CATEGORY_KEYS` из core/odoo pipeline? → A: `LineCategory` enum остаётся внутри odoo pipeline (file classification), маппится на string `line_category_id` (через `.value`) на выходе в storage/API; `LINE_CATEGORY_KEYS` удаляется (заменяется на динамический список из `line_counts` JSON); frontend не знает про enum.
- Q: `EdgeKind` enum и `EdgeBreakdown` в core — generic или оставить как внутреннее odoo? → A: `EdgeBreakdown` в core contracts перерабатывается на generic `dict[str, int]` (keys=relation_type_id); `EdgeKind` enum остаётся внутри odoo pipeline (маппится на string на выходе); `CouplingEdge.evidence` удаляется. Принцип: Odoo-specific поля остаются в odoo pipeline, если только они не удаляются явно (как evidence).

## User Scenarios & Testing *(mandatory)*

Анализаторы Python-проектов (включая Odoo-профиль) работают с frontend, который сегодня содержит жестко закодированные доменные знания Odoo/Python: категории строк, метрики сложности, типы связей, отдельные вкладки и accordion-блоки. Патч переводит UI к backend-driven модели и удаляет избыточные элементы интерфейса.

### User Story 1 - Backend-driven UI configuration (Priority: P1)

Пользователь открывает frontend. Frontend больше не содержит жестко закодированные списки категорий строк, метрик яркости, типов связей и колонок таблиц. Все эти списки приходят из единого источника конфигурации UI, который отдаёт backend. Frontend только отображает полученные опции, колонки, метрики и связи.

**Why this priority**: Без единого backend-driven конфига все последующие упрощения frontend невозможны — это фундамент для удаления вкладок и упрощения таблиц.

**Independent Test**: Можно проверить, что frontend загружает и рендерит UI без единого импорта доменных констант (`LINE_CATEGORIES`, `BRIGHTNESS_CRITERIA`, `GRAPH_BREAKDOWN_KINDS`, `EDGE_KIND_LABELS`), получая все опции из конфигурации.

**Acceptance Scenarios**:

1. **Given** запущенный backend и frontend, **When** пользователь открывает любое представление (граф, dashboard, таблицы), **Then** все категории, метрики, типы связей и колонки отображаются из конфигурации, отданной backend.
2. **Given** исходный код frontend, **When** выполняется поиск по импортам, **Then** ни один компонент UI не импортирует доменные константы `LINE_CATEGORIES`, `BRIGHTNESS_CRITERIA`, `GRAPH_BREAKDOWN_KINDS`, `EDGE_KIND_LABELS` для построения UI.
3. **Given** конфигурация UI, **When** backend добавляет новую категорию строк или метрику, **Then** frontend отображает её без изменения исходного кода frontend.

---

### User Story 2 - Упрощённая навигация: два раздела (Priority: P1)

Пользователь видит верхнюю навигацию только с двумя разделами: `Report` (снимок по коммиту; tab id `snapshot`) и `Dashboard` (панель метрик; tab id `dashboard`). Вкладки `Structure`, `Analytics`, `Status` удалены.

**Why this priority**: Удаление избыточных вкладок — главная видимая часть упрощения; даёт мгновенный эффект и сокращает площадь поддержки.

**Independent Test**: Можно проверить, что в UI отсутствуют тексты `Structure`/`Структура`, `Analytics`/`Аналитика`, `Status`/`Статус` как top-level вкладки.

**Acceptance Scenarios**:

1. **Given** открытый frontend, **When** пользователь смотрит на верхнюю навигацию, **Then** доступны только `Report` и `Dashboard`.
2. **Given** исходный код `App.tsx`, **When** выполняется анализ импортов, **Then** отсутствуют импорты `AnalyticsPage`, `StructurePage`, `StatusPage`.
3. **Given** файлы страниц, **When** проверяется сборка, **Then** `StructurePage.tsx`, `AnalyticsPage.tsx`, `StatusPage.tsx` либо удалены, либо исключены из runtime-экспорта.

---

### User Story 3 - Упрощённый Report: graph + treemap + две таблицы (Priority: P1)

Пользователь открывает `Report`. Внутри остаются: граф зависимостей, настройки графа, treemap файлов, выбранный модуль, выбранный файл, иерархическая таблица модулей/файлов и единая таблица связей. Удалены accordion-блоки `Parse failures`, `Python file complexity`, `Manifest depends` и колонка `Evidence`.

**Why this priority**: Это основная рабочая поверхность аналитика; упрощение напрямую повышает читаемость снимка по коммиту.

**Independent Test**: Можно проверить, что на странице Report нет блоков `Parse failures`/`Ошибки разбора`, `Python file complexity`/`Сложность Python-файлов`, `Manifest depends`/`Зависимости манифеста` и колонки `Evidence`.

**Acceptance Scenarios**:

1. **Given** открытый `Report`, **When** пользователь просматривает accordion, **Then** присутствуют только `lines` (модули/файлы) и `relations` (связи).
2. **Given** таблица связей, **When** пользователь смотрит колонки, **Then** колонки `Evidence` нет, а строки содержат source entity, target entity, relation type label, strength metric label, strength value.
3. **Given** таблица модулей, **When** пользователь нажимает `Files` на строке модуля, **Then** таблица переключается на уровень файлов выбранного модуля, доступна кнопка `Back to modules`.
4. **Given** страница Report, **When** выполняется её загрузка, **Then** не происходит вызова `fetchFailures`.

---

### User Story 4 - Упрощённые detail panel’и (Priority: P2)

Пользователь выбирает модуль или файл. В карточке модуля остаются только: название, активные метрики яркости и их значения, количество строк файлов по всем доступным категориям строк. В карточке файла удалены `Parse error`, `Top folder`, `Category` и отдельная строка `Lines`.

**Why this priority**: Удаляет технический шум из карточек, оставляя только осмысленные для аналитика метрики.

**Independent Test**: Можно проверить отсутствие перечисленных полей в карточках и их отображении в UI.

**Acceptance Scenarios**:

1. **Given** выбран модуль, **When** пользователь смотрит `ModuleDetailPanel`, **Then** отображаются только: название, активные метрики яркости и их значения, количество строк файлов по категориям.
2. **Given** выбран модуль, **When** пользователь смотрит `ModuleDetailPanel`, **Then** отсутствуют `method count`, `code lines`, `python file count`, `total lines` как отдельные карточки, `score in`, `score out`, outgoing/incoming edges, private calls, parse errors, declared models, inherited models, manifest depends.
3. **Given** выбран файл, **When** пользователь смотрит `FileDetailPanel`, **Then** отсутствуют `Parse error`, `Top folder`, `Category`, строка `Lines`; остаются путь/заголовок, функции, распределения сложности, AST/Jones lines.
4. **Given** исходный код frontend, **When** выполняется поиск использования полей, **Then** frontend не использует `declared_models`, `inherited_models`, `manifest_depends`, `python_complexity_parse_errors`, `score_in`, `score_out`.

---

### User Story 5 - Generic relations table (Priority: P2)

Пользователь смотрит связи. Вместо `EdgePointsTable` с batch-запросами и `ManifestDependsView` он видит единое представление связей, где manifest-зависимости представлены как обычные relation rows с `relation_type_id = "manifest_depends"`.

**Why this priority**: Устраняет фрагментацию связей и отдельные UI-блоки; готовит базу для plugin registry.

**Independent Test**: Можно проверить, что manifest-зависимости доступны через единый endpoint связей и отображаются в одной таблице.

**Acceptance Scenarios**:

1. **Given** открытый `Report`, **When** пользователь открывает таблицу связей, **Then** каждая строка содержит source entity, target entity, relation type label, strength metric label, strength value.
2. **Given** manifest-зависимости, **When** backend отдаёт связи, **Then** они присутствуют как строки с `relation_type_id = "manifest_depends"`.
3. **Given** таблица связей, **When** пользователь смотрит колонки, **Then** нет колонки `Evidence` и Odoo-specific списка категорий.
4. **Given** исходный код frontend, **When** выполняется поиск, **Then** компоненты `ManifestDependsView.tsx` и `EvidenceStack.tsx` удалены или исключены из сборки.

---

### User Story 6 - Backend-driven Dashboard selectors (Priority: P2)

Пользователь открывает `Dashboard`. Селекторы метрик приходят из конфигурации backend, а не из жестко закодированных `COMPLEXITY_METRICS`, `MODULE_METRICS`, `AGGS`. Frontend больше не предполагает наличие конкретных метрик `cyclomatic`, `cognitive`, `jones`, `python_file_count`.

**Why this priority**: Приводит Dashboard в соответствие с принципом generic UI.

**Independent Test**: Можно проверить, что `DashboardPage.tsx` не содержит жестко закодированных `COMPLEXITY_METRICS`/`MODULE_METRICS` и получает опции из конфигурации.

**Acceptance Scenarios**:

1. **Given** открытый `Dashboard`, **When** пользователь открывает селектор метрик, **Then** список метрик приходит из конфигурации backend.
2. **Given** backend endpoint метрик timeseries/hotspots, **When** передаётся неизвестный `metric_id`, **Then** возвращается 422/404, если metric id неизвестен или не поддерживает запрошенный scope.
3. **Given** исходный код `DashboardPage.tsx`, **When** выполняется поиск, **Then** отсутствуют жестко закодированные `COMPLEXITY_METRICS`, `MODULE_METRICS`.

---

### User Story 7 - Backend cleanup: endpoint’ы и evidence (Priority: P3)

Backend перестаёт отдавать и собирать данные, которые больше не используются пользовательским UI: endpoint’ы `structure/timeseries`, `edge-kinds/timeseries`, `relations/diff`, `failures`, `depends`, `models`, `edge-evidence`, `edge-points`, `edge-points/batch`, `catalog`, `status` удаляются полностью. Detailed evidence не собирается и не пишется. CLI-команды и тесты, зависящие от удалённых методов, обновляются или удаляются.

**Why this priority**: Снижает площадь backend API и объём хранимых данных; требует обновления CLI/tests под новую модель.

**Independent Test**: Можно проверить, что frontend больше не вызывает удалённые методы, `QueryMethod`/`_METHOD_TABLE` не содержат удалённых методов, а `pytest tests/` проходит.

**Acceptance Scenarios**:

1. **Given** исходный код frontend, **When** выполняется поиск вызовов, **Then** отсутствуют `fetchFailures`, `fetchStructureTimeseries`, `fetchRelationsDiff`, `fetchEdgeKindTimeseries`, `fetchEdgePointsBatch`, `fetchEdges`, `fetchCatalog`, `fetchStatus`.
2. **Given** backend, **When** выполняется анализ `_METHOD_TABLE`, **Then** удалённые методы отсутствуют полностью (не помечаются deprecated, а удаляются).
3. **Given** worker/pipeline, **When** выполняется анализ, **Then** detailed evidence не собирается и не пишется; feature flag `--collect-evidence` не вводится (collect отключён полностью).
4. **Given** хранилище, **When** выполняется пересборка DuckDB, **Then** таблицы `coupling_edge_evidence`, `module_manifest_depend`, `module_model`, `coupling_edge_kind`, `coupling_edge_breakdown` не создаются (`kinds`/`breakdown` хранятся inline как JSON-колонки в `coupling_edge`); manifest-зависимости извлекаются из фактов в query layer.

---

### Edge Cases

- Что если конфигурация UI не содержит ни одной категории строк или метрики? Frontend должен корректно показывать пустые списки/таблицы без ошибок рендера.
- Что если metric id из конфигурации отсутствует в данных node/edge? Значение считается `0`, не вызывает ошибку.
- Что если treemap встречает служебный корневой сегмент `.`? Он не должен отображаться в breadcrumb и legend.
- Что если backend endpoint `ui/config` недоступен при загрузке? Frontend должен показывать понятную ошибку/empty state, не падать.
- Что если CLI/tests зависят от удаляемых API-методов? CLI-команды и тесты обновляются или удаляются в этом патче; обратная совместимость удалённых методов не сохраняется.
- Что если существующий `.duckdb` содержит старые таблицы `coupling_edge_evidence`/`module_manifest_depend`? Проект должен пересобрать DuckDB с нуля; обратная совместимость со старыми файлами не требуется.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Backend MUST предоставлять единый endpoint/method `ui/config` (HTTP `GET /api/ui/config`, RPC `ui/config`), возвращающий конфигурацию UI: категории строк, метрики яркости, типы связей, метрики node size/link thickness, dashboard metrics, определения таблиц.
- **FR-002**: Контракт `UiConfigResponse` MUST включать `UiOption`, `UiMetricOption`, `UiColumnDefinition`, `UiTableDefinition`, `UiGraphConfig` и `UiConfigResponse` с полями, описанными в источнике (`graph`, `dashboard_metrics`, `tables`, `aggregations`). Поле `aggregations: list[UiOption]` содержит доступные статистические агрегации (mean, median, p95, max и т.д.).
- **FR-003**: Frontend MUST получать категории строк, метрики яркости, типы связей, колонки таблиц, metric selectors и metric options настроек графа из `ui/config`, а не из жестко закодированных констант.
- **FR-004**: Frontend MUST удалить из верхней навигации вкладки `Structure`, `Analytics`, `Status`; оставить только `Report` и `Dashboard`.
- **FR-005**: Frontend MUST удалить импорты и использование `AnalyticsPage`, `StructurePage`, `StatusPage`; файлы страниц должны быть удалены или исключены из runtime-экспорта.
- **FR-006**: `SnapshotPage` MUST удалить accordion-блоки `complexity`, `manifest`, `failures`; оставить только `lines` (иерархическая таблица модулей/файлов) и `relations` (единая таблица связей).
- **FR-007**: `SnapshotPage` MUST удалить вызов `fetchFailures` и соответствующее state.
- **FR-008**: `LineCategoryToolbar` MUST принимать `options` (`readonly UiOption[]`), `active` (`ReadonlySet<string>`), `onChange` через props и рендерить опции без switch по конкретным id.
- **FR-009**: `BrightnessToolbar` MUST принимать `options` (`readonly UiMetricOption[]`), `active`, `onChange` через props; все labels приходят из backend.
- **FR-010**: `GraphSettingsPanel` MUST получать edge kind meta, node size metric options, link thickness metric options из `uiConfig.graph`; `enabledEdgeKinds` должен быть `Record<string, boolean>`, `nodeSizeMetric` и `linkThicknessMetric` — `string`, без Odoo-specific union-типов.
- **FR-011**: `ModuleGraph` и связанные селекторы/модели MUST использовать generic metric access по id из config; если metric id неизвестен для node/edge, значение считается `0`; edge labels строятся из config/backend label, а не из локального словаря.
- **FR-012**: `ModuleDetailPanel` MUST отображать только: название модуля, активные метрики яркости и их значения (из `module.metrics[metricId]`), количество строк файлов по всем доступным категориям строк (из `module.line_counts[categoryId]`); удалить `method count`, `code lines`, `python file count`, `total lines` как отдельные карточки, `score in`, `score out`, outgoing/incoming edges, private calls, parse errors, declared models, inherited models, manifest depends.
- **FR-013**: `FileDetailPanel` MUST удалить отображение `Parse error`, `Top folder`, `Category`, `Lines` в нижней строке; оставить путь/заголовок, функции, распределения сложности, AST/Jones measured lines. Поля `top_folder`, `parse_error`, `category`, `lines` MUST быть удалены из `FileSnapshotItemResponse` полностью; treemap и timeseries переводятся на generic `line_category_id` (значения строк приходят через `line_counts` модуля/файла).
- **FR-014**: `FileTreemap` и `treemapTransforms` MUST использовать generic `line_category_id` (string), убрать type cast к Odoo-specific union; breadcrumb/legend MUST не показывать служебный сегмент `.`; фильтрация treemap ведётся по `line_category_id` из `ui/config`, а не по `category`.
- **FR-015**: Поля `top_folder`, `parse_error`, `category`, `lines` MUST быть удалены из `FileSnapshotItemResponse` (API surface), storage schema, writer и odoo pipeline полностью; treemap получает размер файлов из generic `line_counts`/`metrics`, категорию — из нового поля `line_category_id: str`, добавляемого backend в `FileSnapshotItemResponse` (dominant category per file, вычисляется на backend).
- **FR-016**: Backend MUST добавлять `line_category_id: str` в `FileSnapshotItemResponse` (dominant line category per file, вычисляется на backend из классификации); frontend использует его для treemap-фильтрации без вычислений.
- **FR-017**: `GET /api/graph` остаётся (пути endpoint'ов не меняются в этом патче — REST API перерабатывается в отдельной задаче); node contract MUST использовать generic `metrics: dict[str, float]`, `line_counts: dict[str, int]`; edge contract MUST использовать `relation_type_id`/`relation_type_label` из config вместо Odoo-specific kind/labels; `EdgeResponse` остаётся без evidence-полей.
- **FR-018**: `GET /api/catalog` и `GET /api/status` MUST быть удалены из `QueryMethod`/`_METHOD_TABLE`/FastAPI полностью; имена для Dashboard берутся из `snapshot/table/*` rows + `ui/config`; status-диагностика переходит на CLI `doctor`; frontend перестаёт вызывать `fetchCatalog` и `fetchStatus`; CLI-команды и тесты, зависящие от этих методов, обновляются или удаляются.
- **FR-019**: Backend MUST предоставлять `GET /api/project/info` с контрактом `ProjectInfoResponse` (`project_id: str`, `repo_path: str | None`); `SnapshotPage` вызывает его вместо `fetchStatus` для получения project metadata; `run_failures` удаляются из UI.
- **FR-020**: `GET /api/commits` остаётся без изменений (нужен `SnapshotPage`, vscode-extension, tests). Endpoint'ы, которые остаются и не требуют generic-переработки, не трогаются в этом патче.
- **FR-021**: `metrics_timeseries` handler MUST использовать generic catalog-driven dispatch: metric catalog содержит mapping `metric_id` → reader-method/scope; special-case branch'и (`lines`, `lines_by_category`, `python_file_count`) удаляются из handler; frontend передаёт только `metric_id`, backend маппит на reader-method. То же касается `/hotspots` handler.
- **FR-022**: `TimeseriesResponse`/`TimeseriesSeriesResponse`/`TimeseriesPointResponse` MUST быть полностью переработаны на generic новую schema (старые модели удаляются); новая структура backend-driven, frontend только отображает series/points; поля именуются через `metric_id` (не `metric`), все данные берутся из catalog.
- **FR-023**: `HotspotsResponse`/`HotspotItemResponse` MUST быть переработаны на generic: добавить `metric_id: str` в `HotspotsResponse`; убрать hardcoded validation set; items остаются generic (`name`/`current`/`first`/`growth`); валидация `metric_id` через единый metric catalog.
- **FR-024**: `EdgeBreakdownResponse` (Odoo-specific kinds: `model_reuse`, `extension_or_method`, `view`, `field_property`) MUST быть заменена на generic `breakdown: dict[str, int]` в `EdgeResponse` (ключи — `relation_type_id` из config, значения — counts); storage таблица `coupling_edge_breakdown` и writer для неё удаляются (breakdown хранится inline как JSON-колонка в `coupling_edge`); frontend использует config labels для отображения.
- **FR-025**: `GraphNodeResponse` MUST быть переработан на generic (`module_name: str`, `metrics: dict[str, float]`, `line_counts: dict[str, int]`); Odoo-specific поля (`python_file_count`, `method_count`, `cyclomatic_median`, `cognitive_median`, `jones_median`, `score_in`, `score_out`, `line_categories`) удаляются; `ModuleDetailResponse` и `FileDetailResponse` удаляются полностью (detail panels берут данные из `snapshot/table/*` rows, отдельных detail endpoints не нужно).
- **FR-026**: Storage schema MUST использовать JSON-колонки для generic-данных: `metrics: JSON` (dict[str, float]), `line_counts: JSON` (dict[str, int]), `breakdown: JSON` (dict[str, int]), `kinds: JSON` (dict[str, int]) в существующих таблицах (`module_aggregate`, `file_metric`, `coupling_edge`); hardcoded колонки (`cc_*`, `cog_*`, `jones_*`, `score_in`, `score_out`, `python_file_count`, `method_count`, `declared_models_count`, `inherited_models_count`, `python_complexity_parse_errors`, `model_reuse`, `extension_or_method`, `view`, `field_property`) удаляются; таблицы `coupling_edge_evidence`, `module_manifest_depend`, `module_model`, `coupling_edge_kind`, `coupling_edge_breakdown` удаляются (`kinds`/`breakdown` хранятся inline как JSON-колонки в `coupling_edge`); writer и queries перерабатываются на чтение/запись JSON; проекты пересобирают DuckDB с нуля.
- **FR-027**: `LineCategoriesResponse` (Odoo-specific hardcoded categories) MUST быть удалена; заменяется на `line_counts: dict[str, int]` (JSON-колонка). `MetricDistributionResponse` перерабатывается в generic `distributions: dict[str, MetricDistribution]` (keys=metric_id из catalog); hardcoded `cyclomatic`/`cognitive`/`jones` поля удаляются из `ModuleSnapshotItemResponse` и `FileSnapshotItemResponse`.
- **FR-028**: `LineCategory` enum остаётся внутри odoo pipeline как внутренняя деталь профиля (определён в `src/ppi/core/value_objects.py`, используется в `src/ppi/core/odoo/file_classification.py`); маппится на string `line_category_id` (через `.value`) на выходе в storage/API; `LINE_CATEGORY_KEYS` в `pipeline.py` удаляется (заменяется на динамический список ключей из `line_counts` JSON); frontend не знает про enum.
- **FR-029**: `EdgeBreakdown` в core contracts (`contracts.py`) перерабатывается на generic `breakdown: dict[str, int] | None` (keys=`relation_type_id`); `EdgeKind` enum (`value_objects.py`) остаётся внутри odoo pipeline как внутренняя деталь профиля (маппится на string на выходе в storage/API); `CouplingEdge.evidence` удаляется (согласно Q3); Odoo-specific поля остаются в odoo pipeline, если только они не удаляются явно (как evidence).
- **FR-030**: Frontend MUST заменить `ModuleLinesTable` и `FileComplexityTable` на одну иерархическую generic таблицу (`SnapshotEntityTable`/`HierarchicalSnapshotTable`): уровень 1 — модули с кнопкой `Files`, уровень 2 — файлы выбранного модуля с кнопкой `Back to modules`; колонки приходят из backend config.
- **FR-031**: Frontend MUST заменить `EdgePointsTable` и `ManifestDependsView` на generic `RelationsTable`; строка содержит минимум source entity, target entity, relation type label, strength metric label, strength value; не содержит колонку `Evidence`, Odoo-specific category list, hardcoded `edgeKindLabel()`.
- **FR-032**: Backend MUST предоставлять endpoint `GET /api/snapshot/relations?commit=...&include_zero_score=false` с контрактом `RelationsResponse` (`commit_hash`, `columns`, `rows`), где manifest-зависимости представлены как relation rows с `relation_type_id = "manifest_depends"`.
- **FR-033**: Backend MUST предоставлять endpoints `GET /api/snapshot/table/modules?commit=...` и `GET /api/snapshot/table/files?commit=...&module=...` с контрактом `GenericTableResponse` (`commit_hash`, `table_id`, `columns`, `rows`); frontend получает и строки, и структуру колонок из этих endpoints. Старые endpoints `GET /api/snapshot/modules` и `GET /api/snapshot/files` MUST быть удалены полностью вместе с response models (`ModuleSnapshotResponse`, `FileSnapshotResponse`); vscode-extension, CLI tests и contract tests переходят на `snapshot/table/*`.
- **FR-034**: `DashboardPage` MUST получать metric options из `ui/config.dashboard_metrics` как единственного источника; отдельный `/api/metrics/catalog` не вводится. `DashboardPage` MUST получать aggregation options из `ui/config.aggregations` (общий `list[UiOption]` в `UiConfigResponse`); frontend не должен содержать жестко закодированные `COMPLEXITY_METRICS`, `MODULE_METRICS`, `AGGS`.
- **FR-035**: Backend endpoints `/metrics/timeseries` и `/hotspots` MUST принимать generic `metric_id: str` и валидировать по единому metric catalog (тому же источнику, что питает `ui/config.dashboard_metrics`); hardcoded set в `_handlers.py`/`requests.py` MUST быть удалён; возвращать 422/404 при неизвестном/неподдерживаемом metric id.
- **FR-036**: Frontend MUST удалить вызовы `fetchFailures`, `fetchStructureTimeseries`, `fetchRelationsDiff`, `fetchEdgeKindTimeseries`, `fetchEdgePointsBatch`, `fetchEdges`, `fetchCatalog`, `fetchStatus`, `fetchSnapshotModules`, `fetchSnapshotFiles` (все эти методы удаляются из `QueryMethod`/`_METHOD_TABLE`/FastAPI; покрываются `graph`, `snapshot/relations`, `snapshot/table/*`, `ui/config`, `project/info`).
- **FR-037**: Backend MUST удалить user-facing endpoint’ы `structure/timeseries`, `edge-kinds/timeseries`, `relations/diff`, `failures`, `depends`, `models`, `edge-evidence`, `edge-points`, `edge-points/batch` (после появления `snapshot/relations`) из `QueryMethod`/`_METHOD_TABLE`/FastAPI полностью; CLI-команды и тесты, зависящие от этих методов, MUST быть обновлены или удалены в этом патче.
- **FR-038**: Worker/pipeline MUST прекратить собирать и писать detailed evidence; writer-код и schema для таблицы `coupling_edge_evidence` MUST быть удалены в этом патче; проекты пересобирают DuckDB с нуля. Поле `evidence` MUST быть удалено из `CouplingEdge` (core contracts), а mapping evidence — из `analysis_mappers.edge_snapshot_to_contract()`. Feature flag `--collect-evidence` не вводится (collect отключён полностью).
- **FR-039**: Parse failures MUST быть удалены из пользовательского snapshot UI; внутренний сбор failures может оставаться для CLI-диагностики, `doctor`, debugging; `/api/failures` удаляется из user-facing API, если нет другого клиента.
- **FR-040**: Manifest dependencies MUST быть представлены как обычные relations в `/api/snapshot/relations`; `ManifestDependsView` удаляется из UI; writer-код и schema для таблицы `module_manifest_depend` MUST быть удалены в этом патче; manifest-зависимости извлекаются из фактов/мапперов в query layer напрямую в generic relation rows.
- **FR-041**: Backend response models MUST содержать generic fields `metrics: dict[str, float]` и `line_counts: dict[str, int]` в `ModuleSnapshotItemResponse`; Odoo-specific поля (`declared_models`, `inherited_models`, `manifest_depends`, `python_complexity_parse_errors`, `score_in`, `score_out`) MUST быть удалены из response model и `ModuleAggregate` в core contracts (`contracts.py`); `declared_models`/`inherited_models`/`manifest_depends` остаются в `ModuleFacts` (`odoo/snapshots.py`) как odoo-internal (нужны для извлечения relation rows в query layer); `python_complexity_parse_errors` удаляется из `ModuleFacts` (использовалось только для UI); `score_in`/`score_out` удаляются из `ModuleAggregate` (core contract, не из `ModuleFacts`); storage schema, writer, analysis_mappers обновляются соответственно.
- **FR-042**: Frontend MUST удалить или перестать использовать translation/i18n ключи: `tabs.structure`, `tabs.analytics`, `tabs.status`, `snapshot.sections.fileComplexity`, `snapshot.sections.manifestDepends`, `snapshot.sections.parseFailures`, labels для hardcoded line categories/brightness metrics/edge kinds, если labels приходят из backend.
- **FR-043**: Frontend dead code и трансформации, обслуживавшие только удалённые страницы (`structureTransforms.ts`, `analyticsTransforms.ts`, `ManifestDependsView.tsx`, `ParseFailureView.tsx`, `EvidenceStack.tsx`), MUST быть удалены или исключены из сборки; `timeseriesChart.ts` MUST быть переработан (удалить hardcoded `LINE_CATEGORIES`/`edgeKindLabel`); тесты, использующие эти файлы, обновляются под новую модель.
- **FR-044**: `EdgePointsResponse` и `EdgeEvidenceResponse` MUST быть удалены из `schemas.py`/`dispatch.py`/`_handlers.py` полностью; evidence-поля (`evidence_count`, `why_points`, `source_quote`) MUST быть удалены из `EdgeResponse`; `EdgeResponse` остаётся для graph endpoint без evidence-полей.

### Key Entities *(include if feature involves data)*

- **UiOption**: generic опция UI (id, label, description, default_enabled) — базовый строительный блок для категорий, типов связей.
- **UiMetricOption**: опция метрики (id, label, scope, value_type, unit, format, default_enabled, weight) — для метрик яркости, node size, link thickness, dashboard.
- **UiColumnDefinition**: определение колонки таблицы (id, label, value_type, format, align, visible_by_default).
- **UiTableDefinition**: определение таблицы (id, label, columns).
- **UiGraphConfig**: конфигурация графа (line_categories, brightness_metrics, edge_types, node_size_metrics, link_thickness_metrics).
- **UiConfigResponse**: полный ответ `ui/config` (graph, dashboard_metrics, aggregations, tables).
- **GenericTableRow**: строка generic таблицы (id, label, values, actions).
- **RelationRowResponse**: строка связи (source_id, source_label, source_kind, target_id, target_label, target_kind, relation_type_id, relation_type_label, strength_metric_id, strength_metric_label, strength_value).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: В исходном коде frontend отсутствуют импорты `LINE_CATEGORIES`, `BRIGHTNESS_CRITERIA`, `GRAPH_BREAKDOWN_KINDS`, `EDGE_KIND_LABELS` для построения UI.
- **SC-002**: В пользовательском UI не встречаются тексты `Structure`/`Структура`, `Analytics`/`Аналитика`, `Status`/`Статус` как top-level вкладки.
- **SC-003**: В пользовательском UI не встречаются тексты `Parse failures`/`Ошибки разбора`, `Python file complexity`/`Сложность Python-файлов`, `Manifest depends`/`Зависимости манифеста`, колонка `Evidence`, `Top folder`, `Category` в file detail, `Parse error` в file detail.
- **SC-004**: `SnapshotPage.tsx` не содержит импортов доменных констант и не вызывает `fetchFailures`.
- **SC-005**: `LineCategoryToolbar` и `BrightnessToolbar` получают options через props от backend-конфига.
- **SC-006**: `ReportTables.tsx` не содержит жестко закодированного Odoo/Python списка колонок; `DashboardPage.tsx` не содержит жестко закодированных `COMPLEXITY_METRICS`/`MODULE_METRICS`.
- **SC-007**: Backend предоставляет `ui/config`, generic relation endpoint (`/api/snapshot/relations`), и manifest-зависимости доступны как relation rows.
- **SC-008**: Frontend не вызывает удалённые endpoint’ы; `QueryMethod`/`_METHOD_TABLE` не содержат удалённых методов; CLI-команды и тесты, зависящие от удалённых методов, обновлены или удалены.
- **SC-009**: Detailed evidence не собирается и не пишется; таблицы `coupling_edge_evidence`, `module_manifest_depend`, `module_model`, `coupling_edge_kind`, `coupling_edge_breakdown` отсутствуют в schema/writer; проекты пересобирают DuckDB с нуля.
- **SC-010**: Добавление новой категории строк или метрики в backend-конфиг не требует изменения исходного кода frontend для её отображения.

## Assumptions

- Пользователи (аналитики Python/Odoo-проектов) имеют стабильный доступ к локальному backend и frontend.
- Полноценная plugin registry, миграция на long format metrics, замена DuckDB schema, переход на OpenAPI SDK generation, полный редизайн graph visualization и переработка REST API путей endpoint'ов (в отдельной задаче, не в этом патче) выходят за рамки этого патча (non-goals).
- Backend может временно собирать `UiConfigResponse` из текущих известных колонок и метрик до появления plugin registry.
- Odoo-specific поля (`declared_models`, `inherited_models`, `manifest_depends`, `python_complexity_parse_errors`, `score_in`, `score_out`) удаляются из response model, `ModuleAggregate` (core contracts), storage schema, writer, analysis_mappers; `declared_models`/`inherited_models`/`manifest_depends` остаются в `ModuleFacts` (odoo pipeline internal, нужны для извлечения relation rows); `python_complexity_parse_errors` удаляется из `ModuleFacts` (использовалось только для UI); вводятся generic `metrics: dict[str, float]` и `line_counts: dict[str, int]`.
- Поля `top_folder`, `parse_error`, `category`, `lines` удаляются из `FileSnapshotItemResponse`, storage schema, writer и odoo pipeline полностью; treemap и timeseries переводятся на generic `line_category_id` (значения строк через `line_counts`).
- Storage schema перерабатывается на JSON-колонки (`metrics`, `line_counts`, `breakdown`, `kinds`) в существующих таблицах; hardcoded колонки удаляются; таблицы `coupling_edge_evidence`, `module_manifest_depend`, `module_model`, `coupling_edge_kind`, `coupling_edge_breakdown` удаляются; проекты пересобирают DuckDB с нуля.
- Parse failures collection может оставаться внутри worker для CLI-диагностики, `doctor`, debugging; удаляется только из пользовательского UI.
- CLI/tests, зависящие от удаляемых API-методов, обновляются или удаляются в этом патче; методы не помечаются deprecated, а удаляются полностью.
- Translation/i18n cleanup затрагивает только ключи, связанные с удаляемыми вкладками, блоками и hardcoded labels; остальные переводы не изменяются.
- Реализация следует предложенному порядку: (1) `ui/config` backend+frontend, (2) toolbars backend-driven, (3) удаление вкладок, (4) упрощение `SnapshotPage`, (5) detail panel’и, (6) иерархическая таблица, (7) `RelationsTable`, (8) backend response models, (9) dead code/i18n, (10) evidence collection.