# Implementation Plan: UI Simplification & Backend-Driven UI Model

**Branch**: `005-ui-simplification-backend-driven` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-ui-simplification-backend-driven/spec.md`

## Summary

Перевод frontend к backend-driven модели: единый `ui/config` endpoint отдаёт все опции UI (категории строк, метрики, типы связей, колонки таблиц, агрегации); удаляются избыточные вкладки (`Structure`, `Analytics`, `Status`) и accordion-блоки (`Parse failures`, `Python file complexity`, `Manifest depends`); detail panel’и упрощаются; `ModuleLinesTable`/`FileComplexityTable` заменяются на одну иерархическую generic таблицу; `EdgePointsTable`/`ManifestDependsView` — на generic `RelationsTable`. Backend: storage переходит на JSON-колонки (`metrics`, `line_counts`, `breakdown`, `kinds`), hardcoded колонки и Odoo-specific поля удаляются во всём стеке (response models → core contracts → storage → writer → odoo pipeline), удаляются user-facing endpoint’ы (`structure/timeseries`, `edge-kinds/timeseries`, `relations/diff`, `failures`, `depends`, `models`, `edge-evidence`, `edge-points`, `edge-points/batch`, `edges`, `catalog`, `status`, `snapshot/modules`, `snapshot/files`, `snapshot/module`, `snapshot/file`), вводятся новые (`ui/config`, `snapshot/table/modules`, `snapshot/table/files`, `snapshot/relations`, `project/info`), `GET /api/graph` и `GET /api/commits` остаются с обновлённым/без изменений contract. Storage-таблицы `coupling_edge_evidence`, `module_manifest_depend`, `module_model`, `coupling_edge_kind`, `coupling_edge_breakdown` удаляются. Проекты пересобирают DuckDB с нуля.

## Technical Context

**Language/Version**: Python 3.11+, TypeScript 5.x (React frontend)

**Primary Dependencies**: FastAPI, Pydantic (API boundary), msgspec (core contracts), DuckDB (storage), React, TypeScript, Mantine (frontend), pluggy (plugins)

**Storage**: DuckDB с JSON-колонками (`metrics: JSON`, `line_counts: JSON`, `breakdown: JSON`); hardcoded колонки удаляются; таблицы `coupling_edge_evidence`, `module_manifest_depend` удаляются; проекты пересобирают DuckDB с нуля

**Testing**: pytest (contract/integration/unit), Vitest (frontend transforms/domain)

**Target Platform**: Локальный запуск (CLI + FastAPI server + React frontend + VS Code extension webview)

**Project Type**: CLI + web-service (FastAPI) + frontend (React) + VS Code extension

**Performance Goals**: Стандартные веб-ожидания (UI responsive); пересборка DuckDB一次性 при первом запуске после патча

**Constraints**: Offline-capable (локальный MVP); core не зависит от UI/transport (Constitution Principle II); generic UI, не hard-wired to Python/Odoo (Principle IV)

**Scale/Scope**: ~50 файлов backend + ~25 файлов frontend; 44 FR (FR-001..FR-044)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Functional Core, OO Shell | PASS | Core остаётся pure functions; `EdgeBreakdown` → generic dict, `evidence` удаляется; odoo pipeline остаётся внутренней деталью профиля |
| II. Layered Core Independence | PASS | Core не зависит от UI/transport; `ui/config` собирается в query/server layer, не в core; generic `metrics`/`line_counts` в core contracts — domain-neutral |
| III. Plugin-Based Extensibility | PASS | `ui/config` — временный источник до plugin registry (non-goal этого патча); `LineCategory`/`EdgeKind` enums остаются внутри odoo pipeline (внутренняя деталь профиля), маппятся на string на выходе |
| IV. CLI-First, Multi-Interface | PASS | CLI-команды и тесты, зависящие от удаляемых endpoint’ов, обновляются/удаляются; UI generic, не hard-wired to Odoo |
| V. Single-Writer Data Ownership | PASS | Writer перерабатывается на JSON-колонки; single-writer сохраняется; проекты пересобирают DuckDB |
| VI. Typed Contracts & Explicit Error Handling | PASS | msgspec в core, Pydantic на API boundary; generic `dict[str, float/int]` — typed; `Result`/`Option` сохраняются |

## Project Structure

### Documentation (this feature)

```text
specs/005-ui-simplification-backend-driven/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ui-config.md
│   ├── snapshot-tables.md
│   ├── relations.md
│   ├── graph.md
│   ├── project-info.md
│   └── removed-endpoints.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/ppi/
├── server/
│   └── api.py            # FastAPI endpoints: добавить ui/config, snapshot/table/*, snapshot/relations, project/info; удалить catalog, status, failures, depends, models, edge-evidence, edge-points, edge-points/batch, structure/timeseries, edge-kinds/timeseries, relations/diff
├── query/
│   ├── _handlers.py      # catalog-driven dispatch для metrics_timeseries/hotspots; удалить edge_points/edge_evidence/structure_timeseries/edge_kind_timeseries/relations_diff/manifest_depends/models/failures handlers
│   ├── _params.py
│   ├── contracts.py
│   ├── dispatch.py       # QueryMethod: удалить STRUCTURE_TIMESERIES/EDGE_POINTS/EDGE_POINTS_BATCH/EDGE_EVIDENCE/EDGE_KIND_TIMESERIES/RELATIONS_DIFF/CATALOG/STATUS/FAILURES/DEPENDS/MODELS; добавить UI_CONFIG/SNAPSHOT_TABLE_MODULES/SNAPSHOT_TABLE_FILES/SNAPSHOT_RELATIONS/PROJECT_INFO
│   ├── errors.py
│   ├── requests.py       # удалить hardcoded metric validation sets
│   ├── rpc_server.py
│   └── schemas.py        # переработать: UiConfigResponse, GenericTableResponse, RelationsResponse, ProjectInfoResponse, generic GraphNodeResponse/EdgeResponse/TimeseriesResponse/HotspotsResponse; удалить ModuleSnapshotResponse/FileSnapshotResponse/EdgePointsResponse/EdgeEvidenceResponse/LineCategoriesResponse/ModuleDetailResponse/FileDetailResponse/StructureTimeseriesResponse/EdgeKindSeriesResponse/RelationsDiffResponse/ManifestDependsResponse/FailuresResponse/CatalogResponse/StatusResponse
├── storage/
│   ├── queries.py        # JSON-колонки чтение; удалить manifest_depends_at_commit/edge_points/edge_evidence/structure_timeseries/edge_kind_timeseries/relations_diff/failures/depends/models queries
│   ├── schema.py         # JSON-колонки (metrics, line_counts, breakdown); удалить coupling_edge_evidence, module_manifest_depend, hardcoded cc_*/cog_*/jones_*/score_in/score_out/python_file_count/declared_models_count/inherited_models_count/python_complexity_parse_errors/model_reuse/extension_or_method/view/field_property колонки
│   └── writer.py         # JSON-колонки запись; удалить evidence/manifest_depends/coupling_edge_breakdown/coupling_edge_kind writer; переработать module_aggregate/file_metric/coupling_edge writes (kinds/breakdown inline JSON)
├── core/
│   ├── contracts.py      # EdgeBreakdown → dict[str,int]|None; CouplingEdge.evidence удалить; ModuleFacts Odoo-specific поля удалить; добавить metrics/line_counts
│   ├── analysis_mappers.py # удалить evidence mapping; Odoo-specific поля → generic
│   ├── value_objects.py  # EdgeKind/EdgeKindGroup остаются (odoo internal); LINE_CATEGORY_KEYS удалить
│   └── odoo/
│       ├── facts.py      # EdgeBreakdown → dict[str,int]; EdgeKind остаётся
│       ├── snapshots.py  # line_category_id вычисляется; Odoo-specific поля → string mapping
│       ├── pipeline.py   # LINE_CATEGORY_KEYS удалить; manifest_depends → relation rows mapping
│       ├── file_classification.py # LineCategory enum остаётся (internal)
│       └── edge_scoring.py
├── cli/
│   └── main.py           # удалить edge-points/edge-evidence/structure-timeseries/edge-kinds-timeseries/relations-diff/failures/depends/models CLI команды; обновить graph/snapshot commands
└── adapters/

frontend/src/
├── App.tsx              # удалить Structure/Analytics/Status tabs
├── navigation.tsx       # AppTab = "snapshot" | "dashboard"
├── api/
│   ├── client.ts        # добавить fetchUiConfig/fetchProjectInfo/fetchSnapshotTableModules/fetchSnapshotTableFiles/fetchSnapshotRelations; удалить fetchFailures/fetchStructureTimeseries/fetchRelationsDiff/fetchEdgeKindTimeseries/fetchEdgePointsBatch/fetchEdges/fetchCatalog/fetchStatus/fetchSnapshotModules/fetchSnapshotFiles
│   └── schemas.ts       # UiConfigResponse schema; generic schemas; удалить старые
├── registry/odooProfile.ts # удалить LINE_CATEGORIES/BRIGHTNESS_CRITERIA/GRAPH_BREAKDOWN_KINDS/EDGE_KIND_LABELS/NON_SCORING_EDGE_KINDS/isScoringEdgeKind/edgeKindLabel/graphBreakdownKindMeta/graphNodeMetricValue; оставить только generic helpers без Odoo id
├── components/
│   ├── LineCategoryToolbar.tsx   # props: options, active, onChange
│   ├── BrightnessToolbar.tsx     # props: options, active, onChange
│   ├── GraphSettingsPanel.tsx    # backend-driven options
│   ├── graphSettingsTypes.ts     # Record<string,boolean>/string types
│   ├── ModuleGraph.tsx          # generic metric access
│   ├── graphViewModel.ts        # generic metric access
│   ├── graphSelectors.ts        # generic metric access
│   ├── ModuleDetailPanel.tsx   # только name/metrics/line_counts
│   ├── FileDetailPanel.tsx     # удалить parse_error/top_folder/category/lines
│   ├── FileTreemap.tsx         # line_category_id; убрать `.`
│   ├── ReportTables.tsx        # SnapshotEntityTable + RelationsTable; удалить ModuleLinesTable/FileComplexityTable/EdgePointsTable
│   └── [удалить] ManifestDependsView.tsx, ParseFailureView.tsx, EvidenceStack.tsx
├── pages/
│   ├── SnapshotPage.tsx       # uiConfig state; удалить failures/manifest/complexity accordion; fetchProjectInfo вместо fetchStatus
│   ├── DashboardPage.tsx      # metric options из ui/config.dashboard_metrics; aggregations из ui/config.aggregations
│   └── [удалить] StructurePage.tsx, AnalyticsPage.tsx, StatusPage.tsx
├── transforms/
│   ├── treemapTransforms.ts    # line_category_id; убрать `.`
│   ├── snapshotTransforms.ts   # generic
│   ├── reportTransforms.ts     # удалить Evidence/KindRow
│   ├── dashboardTransforms.ts  # generic
│   └── [удалить] structureTransforms.ts
├── i18n/, locales/            # удалить tabs.structure/analytics/status, snapshot.sections.fileComplexity/manifestDepends/parseFailures, hardcoded labels

vscode-extension/src/
└── webviewPanel.ts             # обновить allowed methods: snapshot/table/* вместо snapshot/modules, snapshot/files

tests/
├── contract/                   # обновить parity tests: удалить edge-points/edge-evidence/structure-timeseries/relations-diff/failures/depends/models/catalog/status; добавить ui/config/snapshot-table/relations/project-info
├── integration/                # обновить dashboard_api/snapshot_parity/quickstart_flow
└── unit/                       # обновить facts/restored_metrics: EdgeBreakdown → dict; удалить Odoo-specific fields
```

**Structure Decision**: Существующая структура `src/ppi/` (query/storage/core/cli/server) + `frontend/src/` (React) + `vscode-extension/src/` + `tests/`. Изменения затрагивают все слои, но структура каталогов не меняется — только содержимое файлов и удаление нескольких frontend-компонентов/страниц.

## Complexity Tracking

> Конституция не нарушена; таблица не требуется. Удаление hardcoded полей и endpoint’ов снижает сложность, не увеличивает её.