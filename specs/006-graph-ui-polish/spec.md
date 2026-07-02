# Feature Specification: Graph UI Polish and Tables Reorganization

**Feature Branch**: `006-graph-ui-polish`  
**Created**: 2026-07-02  
**Status**: Ready for implementation  
**Input**: UI notes with resolved decisions for graph sidebar cleanup, timelapse behavior, table reorganization, metrics dashboard validation, commit date visibility, and small detail-area cleanup.

## Clarifications

### Session 2026-07-02

- Q: Should the new top-level Tables tab use the same selected snapshot/commit as the Report tab, or have its own commit selector? -> A: Use the shared selected snapshot/commit from the page/application state, matching the Report tab.
- Q: When the user is on the Tables tab and the shared snapshot/commit changes, what happens to table drilldown and table UI state? -> A: Reset invalid content state such as file drilldown and selected module, while preserving safe table UI preferences such as sorting, column visibility, and page size.
- Q: When should automatic graph viewport recovery happen after all nodes leave the viewport? -> A: Run recovery after the pan, drag, or zoom interaction completes, not during the active gesture.
- Q: How strictly should graph pan be bounded so users cannot move the graph into empty space? -> A: Allow panning beyond the graph bounds with a bounded padding area, approximately 30-50% of the viewport size, so users can explore edges without getting lost in empty space.
- Q: Where should readable English labels for edge-type filters come from? -> A: Labels come from backend/config together with edge types; the frontend may use an auto-generated readable fallback only when a label is unavailable.
- Q: If backend/config does not provide an edge-type display label, what fallback should the UI show? -> A: Generate a readable English fallback from the stable key, for example `model_reuse` becomes `Model reuse`, instead of showing raw snake_case.
- Q: Should the Report tab keep compact links or actions to the moved Tables page after module and relations tables are removed? -> A: No. Remove the tables and any table-specific links or actions from the Report tab; Tables are accessed only through the top-level Tables tab.
- Q: In which timezone should the commit date next to the commit selector be displayed? -> A: Display the date and time in the user/browser local timezone using an explicit human-readable date and time format.
- Q: Which human-readable date/time format should be used for the commit date display? -> A: Use a fixed compact `YYYY-MM-DD HH:mm` format, for example `2026-07-02 14:35`.
- Q: How should the Metrics Dashboard handle incompatible combinations of level, metric, and target? -> A: When the level changes, recalculate available targets and metrics; if current values are invalid, replace them with the first valid values and do not send a query until the state is valid.

## Feature Overview

This feature simplifies the project analysis UI by reducing visual noise on the snapshot graph page, moving graph-related controls into the graph settings sidebar, separating large tabular data into a dedicated top-level Tables page, and fixing several confusing or broken interactions in the metrics dashboard.

The main product goal is to make the interface easier to understand while preserving the existing analytical value. The Report tab on the snapshot page should focus on graph exploration and selected-module details. Large module/relation tables should live in their own top-level Tables page. Controls should show user-friendly names, avoid raw technical identifiers, and recover gracefully from confusing interaction states. Small noisy detail elements that do not carry primary analytical value should be removed where explicitly listed in this feature.

## User Scenarios and Testing

### Scenario 1: Cleaner graph settings sidebar

**Given** a user opens the graph snapshot page  
**When** the user looks at the right graph settings sidebar  
**Then** the sidebar no longer contains the Statistics section  
**And** the line-category controls are available as a dedicated sidebar section  
**And** the module-brightness controls are available as a dedicated sidebar section  
**And** edge-type filters use readable English names instead of raw technical identifiers.

### Scenario 2: Graph controls moved out from below the graph

**Given** a user opens the graph snapshot page  
**When** the user scrolls below the graph  
**Then** the old line-category and brightness-control blocks are not shown below the graph  
**And** only the selected-module details area remains below the graph.

### Scenario 3: Timelapse starts from the end

**Given** the timelapse is positioned at the last available snapshot  
**When** the user presses Play  
**Then** playback restarts from the first available snapshot  
**And** playback proceeds through the timeline without requiring the user to manually press Previous.

### Scenario 4: Graph cannot be lost in empty space

**Given** the user pans, drags, or zooms the graph viewport  
**When** the interaction finishes and no graph nodes remain visible in the viewport  
**Then** the graph automatically returns to a visible area  
**And** pan movement is bounded so the user cannot move indefinitely into empty space  
**And** recovery does not fight the user mid-interaction while they are actively dragging, panning, or zooming.

### Scenario 5: Dedicated Tables page

**Given** a user needs tabular module and relation data  
**When** the user opens the top-level Tables tab  
**Then** the module code-lines table and relations table are available there for the same selected snapshot/commit used by the Report tab  
**And** these tables are no longer shown on the snapshot graph page  
**And** the Report tab does not keep table-specific links, shortcut buttons, previews, or actions for the moved tables.

**Given** the user is on the Tables tab with a module drilldown or selected module active  
**When** the shared snapshot/commit changes  
**Then** the drilldown and selected module are reset if they may no longer be valid for the new snapshot  
**And** safe table UI preferences such as sorting, visible columns, and page size remain preserved.

### Scenario 6: Dynamic line-count columns

**Given** the user views the module code-lines table for a snapshot  
**When** the table is rendered  
**Then** line-count data is displayed as separate dynamic columns  
**And** columns are included only for line-count fields that have at least one non-empty value across all rows in the current snapshot  
**And** no line-count cell displays raw serialized object text.

### Scenario 7: Metrics dashboard validates selections

**Given** a user switches the Metrics Dashboard level from Module to File  
**When** the current target is a module-level value  
**Then** the target is reset or replaced with a valid file-level value  
**And** the available metric options are recalculated for the selected level  
**And** if the previously selected metric is not valid for the new level, it is replaced with the first valid metric option  
**And** no query is sent until the selected level, target, metric, and aggregation form a valid combination.

### Scenario 8: Aggregation change is visible

**Given** a user changes the aggregation selector in the Metrics Dashboard  
**When** the resulting line is visually identical or nearly identical  
**Then** the UI still indicates that the chart was recalculated for the selected aggregation  
**And** the selected aggregation is reflected in the chart title or metadata.

### Scenario 9: Commit date is visible

**Given** a user selects a commit on the snapshot page  
**When** the commit selector shows the selected commit  
**Then** the UI also shows the selected commit date and time near the commit field in the user/browser local timezone using the fixed compact format `YYYY-MM-DD HH:mm`.

### Scenario 10: Detail areas remove low-value noise

**Given** a user inspects file-map or file-detail areas on the snapshot page  
**When** the user navigates the treemap breadcrumb or opens a file detail panel  
**Then** technical or low-value labels such as the root `.` breadcrumb marker, parse error, top folder, category, and lower-row lines metadata are not shown  
**And** root navigation and primary file metrics remain available.

## Functional Requirements

### Graph sidebar and graph page simplification

- **FR-001**: The graph settings sidebar MUST remove the entire Statistics accordion section, including visible node counts, visible edge counts, hidden-by-filter counts, selected item summary, focus summary, legend, and explanatory captions.
- **FR-002**: Removing the Statistics section MUST NOT remove equivalent information from other UI areas where the same information is already intentionally displayed.
- **FR-003**: Edge-type filter options MUST be displayed using readable English labels rather than raw identifiers with underscores, using labels supplied by backend/config together with edge-type data.
- **FR-004**: Edge-type filter readable labels MUST be applied consistently anywhere edge-type options remain visible in this feature scope; if a configured label is missing, the UI MUST use a readable auto-generated English fallback rather than showing raw snake_case.
- **FR-005**: The line-category selector currently shown below the graph MUST be moved into the graph settings sidebar as a separate accordion section.
- **FR-006**: The module-brightness criteria selector currently shown below the graph MUST be moved into the graph settings sidebar as a separate accordion section.
- **FR-007**: In the graph settings sidebar, the line-category section MUST appear before the module-brightness criteria section.
- **FR-008**: After moving the two graph-control blocks to the sidebar, the area below the graph MUST contain only the selected-module details block and MUST NOT show the old graph-control blocks.
- **FR-009**: The moved line-category selector MUST preserve its current behavior: changing selected categories updates graph node content and any selected-category summary.
- **FR-010**: The moved module-brightness selector MUST preserve its current behavior: changing selected criteria updates graph node brightness.
- **FR-039**: The frontend MUST NOT maintain the canonical mapping from edge-type identifiers to user-facing labels for this feature; backend/config is the source of truth for edge-type display names.
- **FR-040**: The readable fallback for a missing edge-type label MUST be generated mechanically from the stable identifier by replacing separators with spaces and title-casing words, for example `model_reuse` becomes `Model reuse`.

### Timelapse and graph viewport behavior

- **FR-011**: If timelapse playback is started while the timeline is positioned at the final snapshot, playback MUST restart from the first available snapshot.
- **FR-012**: Timelapse Play MUST begin playback when at least two timeline snapshots are available.
- **FR-013**: Timelapse controls MUST continue to expose Previous, Next, and speed choices, while respecting first/last boundary states.
- **FR-014**: If all graph nodes leave the visible viewport after a pan, drag, or zoom interaction completes, the graph viewport MUST automatically recover to show graph content again.
- **FR-015**: Graph panning MUST be bounded so users cannot move the graph arbitrarily far into empty space while still allowing a limited padding area beyond the graph bounds for exploration.
- **FR-016**: Graph viewport recovery MUST NOT trigger while the user is actively dragging, panning, or zooming, and MUST NOT trigger during normal interactions where at least one node remains visible.
- **FR-038**: The graph pan boundary SHOULD allow padding beyond the graph content bounds of approximately 30-50% of the viewport size, or an equivalent bounded margin that prevents the graph from being lost while preserving normal graph exploration.

### Tables page and table presentation

- **FR-017**: The top-level navigation MUST include a Tables tab placed alongside the existing Report and Dashboard tabs.
- **FR-018**: The Tables tab MUST contain the module code-lines table and the relations table for the same selected snapshot/commit used by the Report tab.
- **FR-019**: The snapshot graph page MUST no longer display the module code-lines table or the relations table.
- **FR-041**: The Report tab MUST NOT keep table-specific links, shortcut buttons, previews, or actions for the moved module and relations tables; users access those tables through the top-level Tables tab.
- **FR-020**: The module code-lines table MUST display line-count values as separate dynamic columns instead of a raw object or serialized JSON value.
- **FR-021**: Dynamic line-count columns MUST be determined from all rows in the current snapshot, not from only the currently visible subset or filtered subset.
- **FR-022**: A dynamic line-count column MUST be shown when at least one row in the current snapshot has a non-empty, non-zero, or otherwise display-worthy value for that field.
- **FR-023**: Empty or unavailable dynamic line-count values MUST render as an empty or neutral table cell, not as raw `null`, `undefined`, or object text.
- **FR-024**: When many dynamic columns are present, the module and relations tables MUST remain horizontally navigable, keep identifying context readable for each row, and avoid collapsing into unreadable clipped content in both supported layout classes for this feature: compact dashboard/webview layout below 900 px viewport width and standard dashboard/webview layout at 900 px viewport width and above.
- **FR-037**: When the shared selected snapshot/commit changes while the user is on the Tables tab, content-specific table state such as selected module and file-level drilldown MUST reset if it may be invalid for the new snapshot, while safe table UI preferences such as sorting, column visibility, and page size SHOULD remain preserved.
- **FR-048**: For this feature scope, safe table UI preferences include sorting, column visibility, and page size; content-specific state includes selected module, selected file, file-level drilldown, and any table state derived from entities that may not exist in the newly selected snapshot.

### Metrics Dashboard fixes

- **FR-025**: The Metrics Dashboard MUST NOT offer a metric/level/target combination that the system cannot query successfully.
- **FR-026**: Selecting the `Python file count` metric at module level MUST NOT produce an internal server error.
- **FR-027**: If a metric is not meaningful or supported for the selected level, the UI MUST either remove it from the metric selector or clearly mark it as unavailable before a query is sent.
- **FR-028**: When the user switches the level to File, the current target MUST be cleared or replaced if it is not a valid file-level target.
- **FR-029**: When the user switches the level, dependent controls such as target and metric MUST remain mutually valid.
- **FR-030**: The Metrics Dashboard MUST avoid showing raw backend validation errors to users when the invalid state can be prevented by control validation.
- **FR-031**: Changing aggregation MUST cause the chart query and chart metadata to reflect the selected aggregation.
- **FR-032**: If different aggregations produce visually identical or nearly identical chart lines, the UI MUST still show a clear indication that recalculation occurred for the selected aggregation.
- **FR-044**: When the Metrics Dashboard level changes, the UI MUST recalculate the available target options and metric options for the selected level before sending a query.
- **FR-045**: If the current target or metric becomes invalid after a level change, the UI MUST replace invalid values with the first valid option for the new level.
- **FR-046**: The Metrics Dashboard MUST NOT send a metrics query while level, target, metric, or aggregation is in a mutually invalid state.
- **FR-049**: If a level change produces no valid targets or no valid metrics, the Metrics Dashboard MUST show a neutral unavailable state for the affected control area and MUST keep queries blocked until a valid combination exists.
- **FR-050**: Within this feature scope, automatic replacement with the first valid option takes precedence over clearing whenever at least one valid option exists; clearing or empty state is used only when no valid option exists for the current level.

### Commit selector date visibility

- **FR-033**: The snapshot page MUST show the selected commit date near the commit selector.
- **FR-034**: The commit date MUST be shown in the fixed compact `YYYY-MM-DD HH:mm` format containing both date and time in the user/browser local timezone.
- **FR-035**: The commit date display MUST remain readable when the commit selector, commit message, and visible-edge count are present in the same header area.
- **FR-036**: If commit date data is unavailable, the UI MUST show a neutral unavailable state rather than an incorrect date; that state MUST remain visually distinct from a real timestamp and MUST preserve stable header layout without implying a false commit chronology.
- **FR-042**: The commit date display MUST avoid ambiguous timezone behavior by consistently using the user/browser local timezone for this feature scope.
- **FR-043**: The commit date display MUST use a stable zero-padded numeric date/time format, for example `2026-07-02 14:35`, rather than locale-dependent text or relative time.

### Detail-area cleanup

- **FR-052**: The treemap breadcrumb root MUST NOT display the technical `.` marker, while preserving the existing ability to navigate to the root level.
- **FR-053**: The file detail panel MUST hide secondary metadata fields that add visual noise in this view, specifically parse error, top folder, category, and the lower-row lines metadata.
- **FR-054**: Removing the listed detail fields MUST NOT remove the primary file metrics and other core analytical values intentionally shown in the file detail panel.

### Accessibility and responsive behavior

- **FR-055**: The new top-level Tables tab, the moved graph-settings accordion sections, and the commit-date metadata area MUST remain accessible through the existing keyboard and focus behavior used by the surrounding UI controls.
- **FR-056**: The snapshot header and table layouts MUST remain readable in both supported layout classes used by this project: compact dashboard/webview layout below 900 px viewport width and standard dashboard/webview layout at 900 px viewport width and above. In both classes, the layout MUST avoid overlapping or obscuring the commit selector, commit date, visible-edge count, and primary table content.

## Edge Cases

- **EC-001**: A graph has zero nodes. Viewport recovery should not loop or repeatedly refit an empty graph.
- **EC-002**: A graph has exactly one node. Panning bounds and recovery should still keep the node discoverable.
- **EC-003**: The timelapse has only one snapshot. Play should not enter a confusing running state.
- **EC-004**: The timelapse is already running and the user presses Play/Pause again. The resulting state must be predictable and visible.
- **EC-005**: Edge-type labels are unavailable for some edge types. The UI must fall back to a readable generated English label such as `Model reuse` rather than showing raw snake_case, while preserving the raw identifier only for internal state and diagnostics.
- **EC-006**: Dynamic line-count columns create a very wide table. The table must remain navigable and readable.
- **EC-007**: The current snapshot contains no non-empty line-count fields. The table should omit dynamic line-count columns or show an intentional empty state.
- **EC-008**: Switching dashboard level invalidates both the selected target and selected metric. Both controls must resolve to valid values before query execution.
- **EC-009**: Two aggregation results are exactly equal. The UI must still communicate the active aggregation.
- **EC-010**: Commit metadata may come from another timezone. The UI must display the date/time in the user/browser local timezone using `YYYY-MM-DD HH:mm` so commits can be compared consistently.
- **EC-011**: A snapshot change occurs while the Tables tab is showing file-level drilldown for a module that does not exist in the new snapshot. The UI should reset to the module-level table rather than showing stale or empty drilldown state as if it were valid.
- **EC-012**: The user pans or zooms rapidly across the graph and briefly has no nodes visible during the gesture. Recovery should wait until the interaction completes before refitting or returning the graph to visible content.
- **EC-013**: The user pans near the edge of a large graph. The bounded padding should allow normal inspection of edge nodes without permitting an unlimited empty viewport.
- **EC-014**: A user expects to find the moved tables from the Report tab. The interface should rely on the visible top-level Tables tab as the navigation path, rather than adding report-page shortcuts that reintroduce visual noise.
- **EC-015**: A level change leaves no valid targets or no valid metrics. The UI should show a neutral empty/unavailable state and avoid sending a query until a valid combination exists.
- **EC-016**: Commit date metadata is missing for the selected commit. The header should preserve stable spacing and show a neutral unavailable state that is visibly distinct from a real timestamp.
- **EC-017**: The Tables tab preserves safe preferences such as sorting and column visibility across a snapshot change while discarding a selected file, expanded row, or drilldown that no longer belongs to the new snapshot.
- **EC-018**: The dashboard has at least one valid metric but no valid targets, or at least one valid target but no valid metrics. The UI should show the affected selector area as unavailable and keep the chart query blocked.
- **EC-019**: The snapshot header becomes crowded by a long commit message together with commit selector, commit date, and visible-edge count. The layout should remain readable without hiding the primary commit-selection context.

## Measurable Success Criteria

- **SC-001**: A user opening the graph settings sidebar sees no Statistics section.
- **SC-002**: All visible edge-type filter options use backend-provided readable English labels, or mechanically generated readable fallbacks when labels are unavailable, and none show raw snake_case labels in normal UI.
- **SC-003**: Starting timelapse from the last snapshot moves playback to the first snapshot and continues playback within one user action.
- **SC-004**: After aggressive panning, the graph viewport returns to visible graph content without requiring the user to press a separate recovery button.
- **SC-005**: The graph page no longer contains the module code-lines table, relations table, or table-specific shortcut actions below the graph.
- **SC-006**: A top-level Tables tab is available and contains both module code-lines and relations tables.
- **SC-007**: The module code-lines table never renders line-count data as a raw JSON object string.
- **SC-008**: Changing the Metrics Dashboard level to File does not leave a module name selected as the target.
- **SC-009**: Selecting `Python file count` at module level does not produce a 500 error.
- **SC-010**: Changing aggregation updates visible chart metadata even when the plotted line is visually similar.
- **SC-011**: The selected commit date and time are visible next to the commit selector in the user/browser local timezone using the `YYYY-MM-DD HH:mm` format.
- **SC-012**: Changing the shared snapshot/commit while on the Tables tab resets invalid drilldown or selected-module state while preserving safe table preferences such as sorting and page size.
- **SC-013**: When the user finishes a graph pan/drag/zoom interaction with no nodes visible, the graph returns to visible content without triggering recovery during the active gesture.
- **SC-014**: When the user repeatedly pans beyond graph boundaries, the viewport remains within a bounded padding area and cannot be moved indefinitely into empty space.
- **SC-015**: If backend/config omits the display label for an edge type such as `model_reuse`, the visible UI shows a readable generated label such as `Model reuse`, not the raw key.
- **SC-016**: The Report tab provides no table-specific shortcuts or previews for the moved tables; table access is through the top-level Tables tab.
- **SC-017**: Commit date display remains stable across locales and always follows the fixed compact format, for example `2026-07-02 14:35`.
- **SC-018**: Switching Metrics Dashboard level never produces a request with an invalid target or unsupported metric/level combination; the UI resolves to a valid combination or an unavailable state before querying.
- **SC-019**: When no valid dashboard target or metric exists for the selected level, the affected control area shows a neutral unavailable state and no metrics request is sent.
- **SC-020**: The snapshot header remains readable in both supported layout classes for this feature, with no overlapping or obscuring of the commit selector, commit message, commit date, and visible-edge count.
- **SC-021**: Treemap breadcrumb root no longer shows `.` and the file detail panel no longer shows parse error, top folder, category, or lower-row lines metadata while primary file metrics remain visible.

## Assumptions

- **A-001**: The existing Report and Dashboard top-level tabs remain available.
- **A-002**: The new Tables tab is the only new top-level tab required by this feature.
- **A-006**: The Tables tab shares the selected snapshot/commit with the Report tab and does not introduce an independent commit selector.
- **A-003**: Existing analytical data used by moved controls and moved tables remains available; this feature changes placement and validation, not the underlying analysis model.
- **A-004**: Human-readable edge labels should be English labels for this feature, regardless of the rest of the UI language.
- **A-005**: Commit date information is available or can be exposed as part of existing commit/snapshot metadata and can be converted for display in the user/browser local timezone.
- **A-007**: Table sorting, column visibility, and page size are considered safe UI preferences that can persist across snapshot changes; selected module and file drilldown are content-specific state and should reset when snapshot changes.
- **A-008**: Graph viewport recovery should be evaluated at the end of user interactions, not continuously during active pan/drag/zoom gestures.
- **A-009**: Bounded pan should be permissive enough for graph exploration and should not hard-clamp the graph exactly to its content bounding box; a padding margin around 30-50% of the viewport is acceptable.
- **A-010**: Backend/config can expose edge-type display labels alongside edge-type identifiers for the graph sidebar and related UI surfaces.
- **A-011**: Edge-type identifiers are stable machine keys that can be mechanically converted to readable fallback text when labels are missing.
- **A-012**: Discoverability for moved tables is provided by the top-level Tables tab itself; the Report tab intentionally does not include table-specific shortcuts in order to keep the graph page clean.
- **A-013**: The browser or UI runtime can determine the user local timezone for commit date display.
- **A-014**: A fixed numeric date/time format is preferred over browser locale formatting for this feature because it is compact, unambiguous, and stable in tests/screenshots.
- **A-015**: The system can determine which targets and metrics are valid for each Metrics Dashboard level, either from existing query/catalog data or from backend-provided UI configuration.
- **A-016**: Existing Mantine or equivalent UI primitives already provide the keyboard/focus behavior needed for the new Tables tab and moved accordion sections without requiring a separate accessibility redesign in this feature.
- **A-017**: Supported layout classes for this feature are the current compact dashboard/webview layout below 900 px viewport width and the current standard dashboard/webview layout at 900 px viewport width and above.

## Key Entities

- **Graph Settings Sidebar**: The right-side control area for graph filters, display settings, forces, focus, zoom, timelapse, line categories, and brightness criteria.
- **Line Category Option**: A user-selectable category controlling which line-count values are displayed inside graph nodes.
- **Brightness Criterion**: A selectable metric or metric group that contributes to module node brightness.
- **Edge Type Filter**: A user-selectable relation type used to show or hide graph edges. It has a stable internal identifier and a backend/config-provided readable display label; if the configured label is missing, the UI uses a readable generated fallback derived from the identifier.
- **Timeline Snapshot**: One position in the graph timelapse, usually associated with a commit.
- **Graph Viewport**: The visible camera area through which the user explores graph nodes and edges.
- **Tables Page**: A top-level page containing large tabular module and relation data for the currently selected snapshot/commit shared with the Report tab.
- **Neutral Unavailable State**: A deliberately non-misleading UI state used when commit-date metadata or a valid dashboard selection value is unavailable; it is visually distinct from a real value and does not imply that data loaded successfully.
- **Module Code-Lines Table**: A table summarizing module-level line counts and related values for a selected snapshot.
- **Relations Table**: A table summarizing relationships between entities for a selected snapshot.
- **Metric Selector State**: The combination of selected level, target, metric, and aggregation on the Metrics Dashboard. The state is valid only when the selected target and metric are supported for the selected level; level changes require recalculating dependent target and metric options before querying.
- **Commit Date Display**: A human-readable date/time shown next to the selected commit, rendered in the user/browser local timezone using the fixed compact `YYYY-MM-DD HH:mm` format for this feature.
- **Table Interaction State**: The local UI state for table sorting, filters, visible columns, pagination, selected module, and drilldown level. Safe display preferences can persist across snapshot changes, while content-specific selections reset when they may become invalid.

## Out of Scope

- Replacing the design system.
- Redesigning the full graph visual language.
- Adding new analytical metrics.
- Changing how project analysis data is collected.
- Introducing a new backend-driven configuration architecture beyond what is needed to satisfy this UI behavior.
- Reworking VS Code extension behavior unless the same UI bundle naturally inherits the changes.
- Redesigning the entire file-detail information architecture beyond the explicitly listed low-noise field removals.
