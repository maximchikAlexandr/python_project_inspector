# Tasks: Graph UI Polish and Tables Reorganization

**Feature**: `006-graph-ui-polish`  
**Input artifacts**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/api-contract.md`, `contracts/ui-interactions.md`, `quickstart.md`  
**Generated**: 2026-07-02  
**Scope**: Incremental React/Mantine/FastAPI dashboard patch, not a full architecture migration.

## Task Format Legend

- `[P]` means the task can run in parallel with other `[P]` tasks in the same phase when it touches independent files.
- `[USx]` marks the user story phase that can be implemented and validated independently.
- Setup, foundation, and polish tasks intentionally do not carry user-story labels.

---

## Phase 1: Setup

- [x] T001 Review the generated 006 artifacts and copy acceptance notes into `specs/006-graph-ui-polish/tasks.md`
- [x] T002 [P] Add shared fixtures for commits, graph payloads, UI config, module rows, file rows, and relations in `frontend/src/test/graphUiPolishFixtures.ts`
- [x] T003 [P] Add a small test helper for rendering dashboard pages with navigation context in `frontend/src/test/renderWithNavigation.tsx`
- [x] T004 [P] Add a reusable fake data source helper for API/component tests in `frontend/src/test/fakeDataSource.ts`
- [x] T005 [P] Add missing translation keys for `Report`, `Dashboard`, `Tables`, line categories, brightness, timelapse, and commit date labels in `frontend/src/i18n.ts`
- [x] T006 Verify local frontend quality gates and document the exact commands in `specs/006-graph-ui-polish/quickstart.md`

---

## Phase 2: Foundational Prerequisites

These tasks block multiple user stories and should be completed before story-specific work.

- [x] T007 Update API TypeScript contracts for commit timestamps, edge display metadata, metric level support, and table fields in `frontend/src/api/client.ts`
- [x] T008 Update Zod schemas to match the new API contracts for commits, UI config, tables, and timeseries in `frontend/src/api/schemas.ts`
- [x] T009 [P] Add readable-label fallback transform for stable keys such as `model_reuse` in `frontend/src/transforms/edgeLabels.ts`
- [x] T010 [P] Add unit tests for readable-label fallback rules in `frontend/src/transforms/edgeLabels.test.ts`
- [x] T011 [P] Add dynamic table column derivation helpers for line-count fields and generic rows in `frontend/src/transforms/tableTransforms.ts`
- [x] T012 [P] Add unit tests for dynamic line-count column derivation across all snapshot rows in `frontend/src/transforms/tableTransforms.test.ts`
- [x] T013 [P] Add commit date formatting helper using local timezone and fixed `YYYY-MM-DD HH:mm` format in `frontend/src/transforms/commitDate.ts`
- [x] T014 [P] Add unit tests for commit date formatting using fixed timestamps in `frontend/src/transforms/commitDate.test.ts`
- [x] T015 Update backend response schemas with any additional UI config fields needed for edge labels and metric level support in `src/ppi/query/schemas.py`
- [x] T016 Update backend UI config handler to return readable edge labels, supported dashboard metric levels, and aggregation options in `src/ppi/query/_handlers.py`

**Checkpoint**: The frontend can decode the enriched backend configuration and has pure helpers for edge labels, dynamic columns, and commit date formatting.

---

## Phase 3: User Story 1 - Clean Graph Settings Sidebar and Move Graph Controls

**Goal**: The graph settings sidebar is cleaner, contains line-category and brightness controls, removes Statistics, and shows readable edge labels.

**Independent Test**: Open the Report page and verify that the right sidebar has line-category and brightness sections before filters, no Statistics section, no old below-graph control blocks, and readable edge-type labels.

- [x] T017 [P] [US1] Add component test for graph sidebar section order and Statistics removal in `frontend/src/components/GraphSettingsPanel.test.tsx`
- [x] T018 [P] [US1] Add component test that edge filters display readable labels and fallback labels in `frontend/src/components/GraphSettingsPanel.test.tsx`
- [x] T019 [US1] Extend `GraphSettingsPanel` props to accept line-category options, brightness options, selected sets, and change handlers in `frontend/src/components/GraphSettingsPanel.tsx`
- [x] T020 [US1] Render the line-category selector as the first graph sidebar accordion section in `frontend/src/components/GraphSettingsPanel.tsx`
- [x] T021 [US1] Render the brightness criteria selector as the second graph sidebar accordion section in `frontend/src/components/GraphSettingsPanel.tsx`
- [x] T022 [US1] Remove the Statistics accordion section and any sidebar-only legend/statistics rendering from `frontend/src/components/GraphSettingsPanel.tsx`
- [x] T023 [US1] Replace raw edge kind labels with backend/config labels plus fallback generated labels in `frontend/src/components/GraphSettingsPanel.tsx`
- [x] T024 [US1] Pass UI config line categories, brightness options, selected values, and handlers from the Report page into the graph settings panel in `frontend/src/pages/SnapshotPage.tsx`
- [x] T025 [US1] Remove old below-graph `LineCategoryToolbar` and `BrightnessToolbar` blocks from `frontend/src/pages/SnapshotPage.tsx`
- [x] T026 [US1] Remove unused imports and dead graph-statistics-only helpers from `frontend/src/components/GraphLegend.tsx`

**Checkpoint**: Report page graph controls are centralized in the sidebar and no raw `snake_case` edge labels appear in normal edge filter UI.

---

## Phase 4: User Story 2 - Dedicated Tables Page and Dynamic Tables

**Goal**: Move large module/relation tables to a top-level Tables page that shares the selected commit with Report and uses dynamic line-count columns.

**Independent Test**: Select a commit on Report, open Tables, verify the same commit is used, module and relation tables are shown there, line counts are columns, and Report contains no table sections or table links.

- [x] T027 [P] [US2] Add tests for shared selected commit state across tabs in `frontend/src/navigation.test.tsx`
- [x] T028 [P] [US2] Add tests for table state reset/preservation on snapshot change in `frontend/src/transforms/tableState.test.ts`
- [x] T029 [P] [US2] Add component test for absence of module/relation tables and table shortcuts on Report in `frontend/src/pages/SnapshotPage.test.tsx`
- [x] T030 [P] [US2] Add component test for `TablesPage` rendering module and relations tables for selected commit in `frontend/src/pages/TablesPage.test.tsx`
- [x] T031 [US2] Extend navigation state with `tables` tab and shared `selectedCommit` state in `frontend/src/navigation.tsx`
- [x] T032 [US2] Update application tabs to include `Tables` next to `Report` and `Dashboard` in `frontend/src/App.tsx`
- [x] T033 [US2] Create `TablesPage` that reads the shared selected commit and loads module table, relations table, and drilldown file rows in `frontend/src/pages/TablesPage.tsx`
- [x] T034 [US2] Move module table rendering ownership from the Report page to `TablesPage` in `frontend/src/pages/SnapshotPage.tsx`
- [x] T035 [US2] Move relations table rendering ownership from the Report page to `TablesPage` in `frontend/src/pages/SnapshotPage.tsx`
- [x] T036 [US2] Remove `openSnapshot` table-section navigation behavior and snapshot table shortcuts from `frontend/src/navigation.tsx`
- [x] T037 [US2] Update `ReportTables` to accept computed dynamic columns and to avoid raw object rendering for line-count values in `frontend/src/components/ReportTables.tsx`
- [x] T038 [US2] Use all module rows in the current snapshot to derive dynamic line-count columns in `frontend/src/pages/TablesPage.tsx`
- [x] T039 [US2] Fetch file table rows by selected module when drilldown is active instead of preloading all files when possible in `frontend/src/pages/TablesPage.tsx`
- [x] T040 [US2] Preserve table sorting, visible columns, and page size while resetting selected module, selected file, drilldown, and other snapshot-bound table state on commit changes in `frontend/src/pages/TablesPage.tsx`

**Checkpoint**: The Report page focuses on graph exploration; the Tables page owns module/relations data and dynamic line-count columns.

---

## Phase 5: User Story 3 - Timelapse Playback and Graph Viewport Recovery

**Goal**: Timelapse starts from the beginning when play is pressed at the final commit, and graph viewport recovery prevents the user from getting lost in empty space.

**Independent Test**: At the final commit, press Play and observe playback from the first commit; pan or zoom the graph until no nodes are visible, release, and observe the graph recover after the gesture.

- [x] T041 [P] [US3] Extract timelapse state transition logic into `frontend/src/transforms/timelapseTransforms.ts`
- [x] T042 [P] [US3] Add unit tests for play-from-last, play-from-middle, stop-at-last, and single-commit behavior in `frontend/src/transforms/timelapseTransforms.test.ts`
- [x] T043 [US3] Update `useSnapshotGraphExplorer` to use the extracted timelapse transition and restart from the first commit when playing from the final commit in `frontend/src/components/useSnapshotGraphExplorer.ts`
- [x] T044 [P] [US3] Add graph viewport visibility and bounded-pan helpers in `frontend/src/transforms/graphViewport.ts`
- [x] T045 [P] [US3] Add unit tests for visible-node detection and 30-50% viewport padding bounds in `frontend/src/transforms/graphViewport.test.ts`
- [x] T046 [US3] Emit interaction-end callbacks from graph pan, zoom, and drag handling in `frontend/src/components/ModuleGraph.tsx`
- [x] T047 [US3] Apply bounded pan with permissive viewport padding in `frontend/src/components/ModuleGraph.tsx`
- [x] T048 [US3] Trigger fit/recovery only after interaction end when no graph nodes are visible in `frontend/src/components/ModuleGraph.tsx`
- [x] T049 [US3] Keep the manual Fit action functional after automatic recovery changes in `frontend/src/components/GraphSettingsPanel.tsx`

**Checkpoint**: Timelapse and graph camera behavior are predictable and recoverable without fighting active user gestures.

---

## Phase 6: User Story 4 - Metrics Dashboard Validity and Aggregation Feedback

**Goal**: The Metrics Dashboard recalculates valid target and metric options when level changes, avoids invalid requests, shows a neutral unavailable state when no valid option exists, and shows aggregation recalculation even when series are visually similar.

**Independent Test**: Switch from Module to File and verify target and metric become valid before requests are sent; when no valid target or metric exists, verify the affected control area shows an unavailable state and no request is sent; select `Python file count` only on supported levels; switch aggregation and verify the title/metadata changes.

- [x] T050 [P] [US4] Add unit tests for level/metric/target normalization in `frontend/src/transforms/dashboardTransforms.test.ts`
- [x] T051 [P] [US4] Add API mock test proving invalid dashboard selections do not call timeseries/hotspots in `frontend/src/pages/DashboardPage.test.tsx`
- [x] T052 [US4] Extend UI config metric options with supported levels and defaults in `frontend/src/api/client.ts`
- [x] T053 [US4] Extend UI config metric option schema with supported levels and defaults in `frontend/src/api/schemas.ts`
- [x] T054 [US4] Update backend `UiMetricOption` schema to expose supported levels for dashboard metrics in `src/ppi/query/schemas.py`
- [x] T055 [US4] Update backend `ui_config` to mark module-only and file-capable metrics explicitly in `src/ppi/query/_handlers.py`
- [x] T056 [US4] Implement target and metric normalization for level changes in `frontend/src/transforms/dashboardTransforms.ts`
- [x] T057 [US4] Load module targets and file targets for the Metrics Dashboard from snapshot table APIs in `frontend/src/pages/DashboardPage.tsx`
- [x] T058 [US4] Prevent timeseries and hotspot requests while dashboard selection state is invalid and show a neutral unavailable state when no valid target or metric exists in `frontend/src/pages/DashboardPage.tsx`
- [x] T059 [US4] Show selected aggregation in chart title or metadata and refresh indicator when aggregation changes in `frontend/src/pages/DashboardPage.tsx`
- [x] T060 [US4] Fix backend handling for module-level `python_file_count` timeseries or remove it from unsupported timeseries choices in `src/ppi/query/_handlers.py`

**Checkpoint**: The dashboard does not produce avoidable 422/500 responses from invalid user-selection state.

---

## Phase 7: User Story 5 - Commit Date Display and Detail Cleanup

**Goal**: The selected commit date is visible in a fixed local-time format, and only the explicitly scoped noisy detail fields are removed from the treemap/file detail areas.

**Independent Test**: Select a commit and see `YYYY-MM-DD HH:mm` near the commit selector; if commit date metadata is unavailable, verify a neutral unavailable state keeps the header readable; select a file in treemap and verify parse error, top folder, category, and lower-row lines metadata are absent while primary metrics remain visible.

- [x] T061 [P] [US5] Add component test for commit date display near the commit selector in `frontend/src/pages/SnapshotPage.test.tsx`
- [x] T062 [P] [US5] Add component test for treemap breadcrumb root without `.` in `frontend/src/components/FileTreemap.test.tsx`
- [x] T063 [P] [US5] Add component test for simplified file details in `frontend/src/components/FileDetailPanel.test.tsx`
- [x] T064 [US5] Update commit option transform to expose commit date display metadata from `authored_at` in `frontend/src/transforms/commitOptions.ts`
- [x] T065 [US5] Render selected commit date near the commit selector in `frontend/src/pages/SnapshotPage.tsx`
- [x] T066 [US5] Ensure commit header layout remains readable with selector, commit date or unavailable state, and visible edge count in `frontend/src/pages/SnapshotPage.tsx`
- [x] T067 [US5] Remove root `.` from treemap breadcrumb display while preserving root navigation behavior in `frontend/src/components/FileTreemap.tsx`
- [x] T068 [US5] Hide parse error, top folder, category, and lower metadata-row lines from file detail panel in `frontend/src/components/FileDetailPanel.tsx`
- [x] T069 [US5] Keep primary file metrics visible after cleanup in `frontend/src/components/FileDetailPanel.tsx`
- [x] T070 [US5] Update translations for commit date, treemap root, and simplified details in `frontend/src/i18n.ts`

**Checkpoint**: Commit chronology is visible, and file/treemap detail views are less noisy.

---

## Final Phase: Polish and Cross-Cutting Validation

- [x] T071 Update frontend API/data-source tests to cover `commits`, `ui/config`, tables, relations, and timeseries contract changes in `frontend/src/api/dataSource.test.ts`
- [x] T072 Update API protocol documentation for changed dashboard responses and UI config behavior in `specs/006-graph-ui-polish/contracts/api-contract.md`
- [x] T073 Update manual validation scenarios after implementation decisions in `specs/006-graph-ui-polish/quickstart.md`
- [x] T074 Run frontend unit tests and fix regressions reported in `frontend/src/**/*.test.ts*`
- [x] T075 Run frontend production and webview builds and fix issues in `frontend/package.json`
- [x] T076 Run backend query/API tests and fix regressions in `src/ppi/query/_handlers.py`
- [x] T077 Perform manual browser smoke validation for all quickstart scenarios and record notes in `specs/006-graph-ui-polish/quickstart.md`
- [x] T078 Add explicit accessibility validation for Tables-tab navigation and commit-date metadata focus/keyboard behavior in `frontend/src/pages/SnapshotPage.test.tsx` and `frontend/src/pages/TablesPage.test.tsx`
- [x] T079 Add explicit accessibility validation for moved graph-settings accordion sections in `frontend/src/components/GraphSettingsPanel.test.tsx`
- [x] T080 Add responsive/readability component validation for snapshot header and wide tables in compact layout below 900 px and standard layout at 900 px and above in `frontend/src/pages/SnapshotPage.test.tsx` and `frontend/src/pages/TablesPage.test.tsx`
- [x] T081 Document manual responsive/readability validation for snapshot header and wide tables in compact layout below 900 px and standard layout at 900 px and above in `specs/006-graph-ui-polish/quickstart.md`

---

## Dependencies

### Phase dependencies

1. Phase 1 Setup must complete before test-heavy implementation begins.
2. Phase 2 Foundation blocks all user stories because it updates shared contracts and pure helpers.
3. US1 and US3 can proceed after Phase 2 and can run mostly in parallel.
4. US2 depends on Phase 2 and should coordinate with US5 because both touch `SnapshotPage.tsx`.
5. US4 depends on Phase 2 and backend UI config updates.
6. Final polish depends on all story phases.
7. Accessibility and responsive validation tasks complete after their related UI stories land.

### Story dependencies

- **US1** depends on T007-T016 and does not depend on the Tables page.
- **US2** depends on shared navigation state from T031 and table transforms from T011-T012.
- **US3** depends on current graph settings/state but not on table relocation.
- **US4** depends on UI config contract updates T052-T055.
- **US5** depends on commit date helper T013-T014.

---

## Parallel Execution Examples

### After Phase 2 foundation

```text
Agent A: T017-T026 [US1] Graph sidebar cleanup
Agent B: T041-T049 [US3] Timelapse and viewport recovery
Agent C: T050-T060 [US4] Metrics Dashboard validation
```

### During Tables page work

```text
Agent A: T027-T030 tests for Tables and Report placement
Agent B: T031-T036 navigation and page split
Agent C: T037-T040 table rendering and drilldown behavior
```

### During detail cleanup

```text
Agent A: T061/T065/T066 commit date display
Agent B: T062/T067 treemap breadcrumb cleanup
Agent C: T063/T068/T069 file detail cleanup
```

---

## Independent Test Criteria

### US1: Graph sidebar cleanup

- Report sidebar has no Statistics section.
- Line categories and brightness controls are in the sidebar in the required order.
- Old below-graph control blocks are gone.
- Edge filter labels are readable and do not show raw `snake_case` in normal UI.

### US2: Tables page and dynamic tables

- Top-level `Tables` tab exists and uses the same selected commit as Report.
- Report page has no module/relation table sections and no table shortcuts.
- Module table line-count values render as separate dynamic columns.
- Table drilldown and other snapshot-bound state reset on commit changes while sorting, visible columns, and page size persist.

### US3: Timelapse and graph viewport

- Play at final commit restarts playback from the first commit.
- Playback stops at the final commit.
- Graph viewport recovers after a gesture leaves all nodes out of view.
- Pan bounds allow exploration but prevent indefinite empty-space movement.

### US4: Metrics Dashboard validity

- Switching level recalculates valid targets and metrics.
- Invalid combinations do not send API requests.
- When no valid target or metric exists, the affected control shows an unavailable state instead of a misleading value.
- `Python file count` no longer causes module/file mismatch errors.
- Aggregation changes are visible in chart title or metadata even when lines look similar.

### US5: Commit date and details

- Selected commit date appears near the commit selector in local `YYYY-MM-DD HH:mm` format.
- Missing commit-date metadata shows a neutral unavailable state without breaking header readability.
- Treemap breadcrumb root no longer displays a technical `.` marker.
- File detail panel hides parse error, top folder, category, and lower-row lines metadata while retaining primary metrics.

### Cross-cutting validation

- Tables tab, moved sidebar sections, and commit-date metadata keep expected keyboard/focus behavior.
- Snapshot header and wide tables remain readable in compact layout below 900 px and standard layout at 900 px and above.

---

## MVP Scope

The minimum shippable implementation is:

1. US1 Graph sidebar cleanup and moved controls.
2. US2 Tables page and dynamic line-count columns.
3. US4 Metrics Dashboard invalid-combination prevention.
4. US5 Commit date display.

US3 viewport recovery and timelapse fixes are still important, but can be validated separately if graph simulation changes become risky.

---

## Implementation Strategy

1. Start with shared types and pure transforms before touching large React components.
2. Write or update tests around pure transforms first because these are easy to validate without browser state.
3. Move UI placement in small commits: navigation first, then page split, then sidebar cleanup.
4. Keep backend changes minimal: enrich existing `/api/ui/config`, `/api/commits`, and existing snapshot endpoints instead of adding new endpoints.
5. Avoid changing analysis/storage collection logic for this feature.
6. Preserve the same frontend bundle behavior for browser dashboard and VS Code Webview.
7. Keep compatibility by reusing existing API endpoints where possible, while hiding no-longer-needed UI sections in frontend.
