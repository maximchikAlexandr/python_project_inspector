# Implementation Plan: Graph UI Polish and Tables Reorganization

**Feature**: `006-graph-ui-polish`  
**Spec**: `specs/006-graph-ui-polish/spec.md`  
**Phase**: plan  
**Created**: 2026-07-02  
**Status**: Ready for implementation

## Summary

This feature is a focused UI polish patch for the existing dashboard. It removes noisy graph-page UI, moves graph controls into the right sidebar, moves large tables to a dedicated top-level `Tables` tab, fixes timelapse behavior at the final snapshot, improves graph viewport recovery, adds commit date display, removes a few explicitly listed low-value detail fields, and prevents invalid Metrics Dashboard requests before they reach the backend.

The patch should be implemented as an incremental change on the current React/FastAPI dashboard, not as a redesign or architecture migration.

## Technical Context

### Current application context

- Frontend runtime: React + TypeScript + Vite.
- UI library: Mantine.
- Charting/graph dependencies: `@mantine/charts`, `recharts`, `d3-force`, `d3-hierarchy`.
- Runtime validation: `zod`.
- Frontend tests: Vitest.
- Backend API: FastAPI routes delegating to shared query dispatcher.
- Current relevant API endpoints include:
  - `GET /api/commits`
  - `GET /api/graph`
  - `GET /api/ui/config`
  - `GET /api/snapshot/table/modules`
  - `GET /api/snapshot/table/files`
  - `GET /api/snapshot/relations`
  - `GET /api/metrics/timeseries`
  - `GET /api/hotspots`

### Relevant current implementation areas

- `frontend/src/pages/SnapshotPage.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/navigation.tsx`
- `frontend/src/components/GraphSettingsPanel.tsx`
- `frontend/src/components/useSnapshotGraphExplorer.ts`
- `frontend/src/components/ModuleGraph.tsx`
- `frontend/src/components/LineCategoryToolbar.tsx`
- `frontend/src/components/BrightnessToolbar.tsx`
- `frontend/src/components/ReportTables.tsx`
- `frontend/src/components/ModuleDetailPanel.tsx`
- `frontend/src/components/FileTreemap.tsx`
- `frontend/src/components/FileDetailPanel.tsx`
- `frontend/src/transforms/dashboardTransforms.ts`
- `frontend/src/transforms/commitOptions.ts`
- `frontend/src/transforms/snapshotTransforms.ts`
- `frontend/src/api/client.ts`
- `frontend/src/i18n/*`
- `src/ppi/server/api.py`
- `src/ppi/query/schemas.py`
- `src/ppi/query/_handlers.py`

## Constitution Check

The project constitution is present at `.specify/memory/constitution.md`.

Compliance summary:

- Principle II `Layered Core Independence`: preserved by keeping analysis/storage changes out of scope and confining this feature to UI, API-contract, and query-surface adjustments.
- Principle III `Plugin-Based Extensibility via Fact Contracts`: preserved by treating readable edge labels, metric-level support, and UI options as contract/config enrichments rather than hardcoded frontend domain mappings.
- Principle IV `CLI-First, Multi-Interface Clients`: preserved by limiting this work to existing dashboard/webview clients without shifting ownership away from the shared worker/API layer.
- Principle V `Single-Writer Data Ownership`: preserved because this feature does not introduce direct client writes to analysis storage.
- Principle VI `Typed Contracts & Explicit Error Handling`: preserved by explicitly updating API/query schemas and by preventing invalid dashboard requests before they reach backend validation paths.

Result: **No constitution conflicts identified for the current feature scope**.

## Constraints

1. Preserve the current React/Mantine stack.
2. Do not redesign the full dashboard.
3. Do not introduce new analysis metrics.
4. Do not change how repository analysis data is collected.
5. Do not introduce a new backend-driven configuration architecture beyond what this patch requires.
6. Keep the same UI bundle behavior for browser mode and VS Code Webview mode where they share the frontend bundle.
7. Keep the spec behavior technology-agnostic, while implementing with the current project stack.

## Implementation Strategy

### Phase 1: Navigation and page split

Goal: create the new top-level `Tables` page and remove tables from the Report tab on the snapshot page.

Work:

1. Extend frontend navigation with a new `tables` top-level tab.
2. Keep `snapshot` and `dashboard` tabs.
3. Make `Tables` use the same selected commit/snapshot state as `Report`.
4. Move module code-lines table and relations table rendering from `SnapshotPage` into the new Tables page.
5. Remove table-specific shortcut links/actions/previews from `Report`.
6. Reset content-specific table state on shared snapshot change:
   - selected module;
   - file drilldown;
   - selected file.
   - any expanded or derived table state tied to entities that may not exist in the new snapshot.
7. Preserve safe table preferences:
   - sorting;
   - visible columns;
   - page size.

Expected result: `Report` focuses on graph and selected module details; `Tables` owns large module/relation tables.

### Phase 2: Graph sidebar cleanup and control relocation

Goal: reduce graph page visual noise and keep graph-related controls in the right sidebar.

Work:

1. Remove the entire `Statistics` accordion section from graph settings.
2. Remove `GraphLegend` usage from the sidebar if it only belongs to the removed section.
3. Move `LineCategoryToolbar` into `GraphSettingsPanel` as a sidebar accordion section.
4. Move `BrightnessToolbar` into `GraphSettingsPanel` as a sidebar accordion section.
5. Ensure sidebar ordering:
   1. line categories;
   2. brightness criteria;
   3. filters;
   4. display;
   5. forces;
   6. focus;
   7. zoom/timelapse area.
6. Remove the old below-graph line-category and brightness blocks.
7. Keep the selected-module detail block below the graph.

Expected result: graph controls are centralized in the sidebar; the area below the graph is simplified.

### Phase 3: Edge labels and UI config usage

Goal: show readable edge-type filter labels without hardcoded frontend domain knowledge.

Work:

1. Use backend/config-provided edge-type labels for filter options.
2. If a label is missing, generate a readable fallback from the stable key:
   - `model_reuse` -> `Model reuse`;
   - `extension_or_method` -> `Extension or method`.
3. Do not show raw `snake_case` keys in normal edge filter UI.
4. Apply the same label behavior to all visible edge-type surfaces that remain in scope.

Expected result: filter labels are readable and plugin/config-friendly.

### Phase 4: Timelapse behavior

Goal: make Play work from the final timeline point.

Work:

1. When Play is pressed while the selected timeline position is the final snapshot, move selection to the first snapshot and start playing.
2. Keep existing Prev/Next behavior.
3. Stop playback when it reaches the last commit.
4. Keep the speed selector behavior.
5. Add tests for:
   - Play from last commit;
   - Play from first/middle commit;
   - single-commit timeline remains non-playable or safely disabled.

Expected result: pressing Play at `N / N` starts a new playback cycle from the beginning.

### Phase 5: Graph viewport recovery and bounded pan

Goal: prevent users from losing all graph nodes in empty canvas space.

Work:

1. Track whether visible graph nodes are inside the viewport after user pan/drag/zoom interaction ends.
2. If no nodes are visible after the interaction finishes, auto-fit or recover graph to a visible area.
3. Do not trigger recovery during active dragging/panning/zooming.
4. Add pan bounds with permissive padding around the graph bounds.
5. Padding should be approximately 30-50% of viewport size.
6. Keep manual Fit action available.

Expected result: users can explore graph edges but cannot remain lost in empty space.

### Phase 6: Dynamic line-count columns

Goal: prevent raw JSON/object display in line-count table cells.

Work:

1. Build line-count columns from non-empty line-count fields across all rows in the current snapshot.
2. Use all rows in the snapshot, not the locally filtered subset, to determine column existence.
3. Render line-count values as separate columns.
4. Avoid raw serialized object text in cells.
5. Preserve existing generic table rendering where possible.
6. Ensure the same column policy is applied in the `Tables` page.

Expected result: module code-lines table uses real dynamic columns and remains readable.

### Phase 7: Metrics Dashboard validity and aggregation feedback

Goal: avoid invalid backend requests and make recalculation visible.

Work:

1. When level changes, recalculate available targets.
2. When level changes, recalculate available metrics.
3. If selected target is invalid, replace it with the first valid target.
4. If selected metric is invalid, replace it with the first valid metric.
5. If no valid target or no valid metric exists for the selected level, show a neutral unavailable state instead of sending a query.
6. Do not send timeseries/hotspots requests until level, target, metric, and aggregation form a valid combination.
7. Fix module-only metric behavior, including `python_file_count`.
8. Ensure file-level target values are file paths, not module names.
9. Make aggregation recalculation visible even when the plotted line is identical or nearly identical:
   - update title/metadata;
   - show selected aggregation consistently;
   - optionally show a lightweight recalculated indicator.

Expected result: the Metrics Dashboard no longer produces avoidable 422/500 errors from invalid selection state.

### Phase 8: Commit date display

Goal: show commit date near the commit selector.

Work:

1. Ensure commit metadata available to frontend includes a timestamp.
2. Display selected commit date next to the commit selector.
3. Convert timestamp to user/browser local timezone.
4. Use fixed format `YYYY-MM-DD HH:mm`.
5. Keep the header layout readable when commit message, visible edge count, and date are all present.

Expected result: users can orient snapshot chronology without opening another view.

### Phase 9: Detail cleanup

Goal: remove only the explicitly scoped noisy elements from detail areas.

Work:

1. Remove `.` from treemap breadcrumb root display.
2. Keep root navigation functional without showing a technical filesystem marker.
3. Simplify file detail panel by hiding:
   - parse error;
   - top folder;
   - category;
   - lines in the lower metadata row.
4. Keep key file metrics visible.
5. Do not redesign the broader file-detail information architecture beyond the listed removals.

Expected result: file map and detail panel are cleaner without losing primary metric value.

## Testing Strategy

### Unit tests

Add or update tests for pure transforms and state reducers:

- readable edge-label fallback;
- timelapse state transitions;
- dynamic line-count column derivation;
- dashboard selection normalization;
- commit date formatting;
- table state reset/preservation policy;
- keyboard/focus behavior for moved controls where practical.

### Component tests / integration tests

Where existing testing setup allows:

- Snapshot page no longer renders old below-graph controls.
- Graph settings no longer renders Statistics section.
- Tables tab renders module and relations tables.
- Report tab does not render table accordions or table shortcuts.
- Metrics Dashboard does not fire requests for invalid combinations.
- Tables tab and moved sidebar sections keep expected keyboard/focus behavior.
- Header and wide-table layouts remain readable in both supported layout classes for this feature: compact dashboard/webview layout below 900 px viewport width and standard dashboard/webview layout at 900 px viewport width and above.

### Manual smoke tests

1. Open dashboard after analysis.
2. Verify top-level tabs: Report, Dashboard, Tables.
3. Verify Report page:
   - no Statistics sidebar section;
   - no module/relation tables;
   - line categories and brightness are in sidebar;
   - only module detail remains below graph.
4. Verify Tables page:
   - uses selected commit from Report;
   - module table renders dynamic line-count columns;
   - relations table remains readable when many dynamic columns are present.
5. Verify timelapse:
   - at final commit, Play starts from beginning.
6. Verify graph viewport:
   - pan graph out of view, release gesture, graph recovers.
7. Verify Dashboard:
   - switching Module/File recalculates targets and metrics;
   - no invalid 422/500 request is triggered;
   - aggregation changes are visible.
8. Verify commit date:
   - date appears next to commit selector in `YYYY-MM-DD HH:mm`.

## Compatibility and Migration

- No persisted storage migration expected.
- Existing backend endpoints can be reused.
- Some response fields may become unused but do not need to be removed in this feature.
- If API additions are needed, prefer extending existing responses instead of introducing unrelated new endpoints.
- Avoid breaking VS Code Webview as it consumes the same frontend bundle.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Snapshot state duplication between Report and Tables | Tables can drift from graph snapshot | Use shared selected commit state in navigation/app shell |
| Graph auto-recovery fighting user gestures | Annoying graph interaction | Run recovery only after interaction completion |
| Dynamic columns causing wide tables | Poor readability | Horizontal scrolling, compact headers, column visibility preference |
| Dashboard selection normalization loops | React state churn or repeated requests | Normalize in a pure transform and guard before setting state |
| Missing edge labels from backend/config | Raw technical UI leaks | Use readable fallback from key |
| Commit date timezone confusion | Incorrect user interpretation | Display in browser local timezone with fixed explicit format |

## Deliverables

- Updated frontend navigation with `Tables` tab.
- Updated graph settings sidebar.
- Updated timelapse behavior.
- Updated graph viewport behavior.
- Updated module/relation table placement.
- Updated Metrics Dashboard validation.
- Updated commit date display.
- Updated tests and manual smoke checklist.
