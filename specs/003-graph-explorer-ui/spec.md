# Feature Specification: Graph Explorer UI — Right-Side Settings Panel

**Feature Branch**: `003-graph-explorer-ui`

**Created**: 2026-06-21

**Status**: Draft

**Input**: User description: "проработай доработку UI. требования к новым возможностям в `.devlocal/ui/ppi_graph_ui_improvements_selected_for_cursor.md`. референс по новой панели на примере скрина обсидиан `.devlocal/ui/image.png`. туда и зума можно перенести"

## Overview

The module dependency graph currently renders nodes, edges, and a few scattered controls, but the analyst has no single place to shape what the graph shows or how it behaves. This feature turns the static graph into an interactive **graph explorer** by adding a right-side settings panel modeled on the Obsidian Graph View panel (the reference screenshot `.devlocal/ui/image.png`): collapsible sections for filtering relationships, tuning the visual display, adjusting layout forces, focusing on a selected module's local neighborhood, and reading live graph statistics. Zoom/fit controls move into this panel as well, so all graph controls live in one consistent place beside the canvas.

All capabilities are client-side improvements layered on the data the report already loads; no backend changes are required for the first version.

## Clarifications

### Session 2026-06-21

- Q: What should persist across a full page reload / new session? → A: Both panel settings (filters/display/forces) and saved layouts persist locally; settings auto-restore on reload.
- Q: What should the commit time-lapse do when it reaches the last commit? → A: Stop (pause) on the last commit.
- Q: How do focus mode and relationship filters compose? → A: Filters apply first (kinds/min weight), then the local subgraph is built on the already-filtered graph.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shape the graph from a single settings panel (Priority: P1)

An analyst opens the module dependency report and wants to reduce the noise of a dense graph: hide certain relationship types, drop weak relationships, simplify labels and arrows, and understand what node size and color mean. They open the settings panel beside the graph, toggle relationship kinds, drag a "minimum edge points" slider, change display options, and read a legend plus live counts of what is shown versus hidden.

**Why this priority**: This is the core value of the feature — turning an unreadable hairball into a focused, legible view — and it delivers immediate usefulness on the data the report already has. It is the foundation every other story builds on (the panel itself).

**Independent Test**: Load any commit's graph, open the panel, disable a relationship kind (e.g. `view`) and raise the minimum edge points; verify matching edges disappear, the legend explains the encodings, and the stats counters update to reflect hidden elements — without any backend change.

**Acceptance Scenarios**:

1. **Given** the report is open with a graph, **When** the analyst opens the settings panel, **Then** a panel appears beside/over the graph with collapsible sections for Filters, Display, Forces, Focus, and Stats, and a control to collapse it back to a compact button.
2. **Given** the panel is open, **When** the analyst turns off a relationship kind, **Then** edges whose visible weight comes only from that kind disappear and the visible-edge count decreases.
3. **Given** the panel is open, **When** the analyst raises the minimum edge points slider, **Then** edges weaker than the threshold are hidden and edge thickness reflects the recomputed weight from the still-enabled kinds.
4. **Given** the analyst turns off every relationship kind, **When** the graph recomputes, **Then** a clear "no relationship kinds selected" notice is shown instead of an empty/ambiguous canvas.
5. **Given** the panel is open, **When** the analyst changes display options (arrows on/off, label mode, node-size metric, link-thickness metric, edge labels, node badges), **Then** the graph updates immediately to match.
6. **Given** the graph is shown, **When** the analyst reads the Stats section and legend, **Then** they can see total vs. visible nodes/edges, how many were hidden by filters, the selected module, and what size/color/thickness encode.
7. **Given** the loaded edge data contains only a subset of relationship kinds, **When** the analyst opens the Filters section, **Then** a toggle is rendered only for each kind actually present in the data (the list is data-driven, not a fixed UI constant).

---

### User Story 2 - Focus on one module's neighborhood and trace its connections (Priority: P2)

An analyst is investigating a specific module's coupling. They click the module, switch on focus mode, and the graph collapses to just that module and its neighbors out to a chosen depth, optionally limited to incoming or outgoing relationships. Hovering any node or edge highlights the connected structure and fades the rest so dependencies are easy to read.

**Why this priority**: Navigation and tracing are the next most valuable capability after taming the graph, and they make the explorer genuinely useful for impact analysis. They depend on the panel from Story 1 but are otherwise independent.

**Independent Test**: Click a module, enable focus mode at depth 1, and confirm only the module and its direct neighbors remain; increase depth and direction filters to confirm the local subgraph expands/narrows; hover a node and confirm neighbors highlight while others fade.

**Acceptance Scenarios**:

1. **Given** a module is selected, **When** the analyst enables focus mode, **Then** only the selected module and its neighbors within the chosen depth remain visible.
2. **Given** focus mode is on, **When** the analyst changes the depth, **Then** the local subgraph expands or contracts by the corresponding number of relationship hops.
3. **Given** focus mode is on, **When** the analyst sets direction to incoming or outgoing, **Then** only relationships of that direction are followed when building the local subgraph.
4. **Given** focus mode is on, **When** the analyst clears focus, **Then** the full global graph returns.
5. **Given** hover highlighting is enabled, **When** the analyst hovers a node, **Then** that node, its neighbors, and connecting edges stay at full opacity and the rest fade to ≤ 0.2; hovering an edge emphasizes the edge and its two endpoints.
6. **Given** hover highlighting is disabled, **When** the analyst hovers, **Then** the graph behaves as it does today (no fading).
7. **Given** focus mode is active on a module, **When** the analyst switches to another commit, **Then** the focus subject and settings persist; if the subject still exists the local subgraph is rebuilt for the new commit, and if it no longer exists focus auto-clears with a notice (FR-021a).

---

### User Story 3 - Tune layout forces and preserve a hand-arranged layout (Priority: P3)

An analyst wants the graph to settle into a readable arrangement. They adjust force sliders (attraction, repulsion, link strength/distance, collision padding, velocity decay), restart or reset the layout, pin important nodes in place by double-clicking, and save the arrangement so it returns the next time they view the same commit.

**Why this priority**: Layout control and persistence are valuable polish that make the explorer comfortable for repeated use, but the graph is already usable without them, so they come after filtering and navigation.

**Independent Test**: Move a force slider and confirm the layout visibly changes; pin a node via double-click and confirm it stays put after a layout restart; save the layout, reload the same commit, load the saved layout, and confirm positions/pins are restored; reset to confirm defaults return.

**Acceptance Scenarios**:

1. **Given** the Forces section is open, **When** the analyst moves a force slider, **Then** the layout responds and rearranges accordingly.
2. **Given** the layout has drifted, **When** the analyst restarts the layout, **Then** the simulation re-runs; **When** they reset forces, **Then** all force values return to their defaults.
3. **Given** a node is positioned where the analyst wants it, **When** they double-click it, **Then** it becomes pinned, shows a pinned marker, and no longer drifts when the layout restarts; double-clicking again unpins it.
4. **Given** the analyst has arranged and pinned nodes, **When** they save the layout and later reopen the same commit, **Then** they can load the saved layout and recover the saved node positions (to saved integer pixel coordinates) and pins; nodes added since the save are auto-placed.
5. **Given** a saved layout exists, **When** the analyst presses "Unpin all", **Then** only in-memory pins are cleared and the saved layout on disk is unchanged until an explicit save; **When** the analyst presses "Reset layout", **Then** in-memory positions/pins AND the saved entry are cleared and an automatic layout is computed.

---

### User Story 4 - Replay how the graph evolved across commits (Priority: P4)

An analyst wants to see how module coupling changed over time. From the panel they start a time-lapse that steps the report through the available commits at a chosen speed, with play/pause and previous/next controls, watching the graph redraw at each commit and seeing which commit is currently shown.

**Why this priority**: This is a compelling but secondary capability that reuses the existing commit list; it is the least essential of the four stories and can ship last.

**Independent Test**: With multiple commits available, press play and confirm the graph advances through commits automatically; pause, step manually with previous/next, and change speed; confirm the current commit and its position in the sequence are always shown.

**Acceptance Scenarios**:

1. **Given** several commits are available, **When** the analyst presses play, **Then** the report advances through commits in order and the graph redraws for each.
2. **Given** a time-lapse is playing, **When** the analyst pauses, **Then** it stops on the current commit; **When** they use previous/next, **Then** it steps one commit at a time.
3. **Given** a time-lapse is running, **When** the analyst changes the speed, **Then** the interval between commits changes accordingly.
4. **Given** a time-lapse is active, **When** the analyst looks at the controls, **Then** the current commit's order, short hash, summary, and sequence position (e.g. "3 / 12") are displayed.
5. **Given** focus mode is active, **When** a time-lapse advances commits, **Then** the focus subject persists across commits; if it is absent at a commit, focus auto-clears (FR-021a) and playback continues.
6. **Given** only one commit is available, **When** the analyst opens the time-lapse controls, **Then** play and prev/next are disabled with a hint that at least two commits are required.

---

### Edge Cases

- **All relationship kinds disabled**: graph area shows the "no relationship kinds selected" notice (FR-011); this notice has top precedence (FR-037); Stats show visible nodes/edges = 0 (US1 #4).
- **Minimum edge points above the strongest edge** (kinds still enabled): a distinct "all edges below threshold" notice is shown while nodes remain visible — this is NOT the same state as "all kinds disabled" (FR-037).
- **Both empty states apply at once** (no kinds selected AND no neighbors in focus): the higher-precedence "no kinds selected" notice wins (FR-037).
- **Focus on a module with no neighbors at the chosen depth/direction**: only the focus subject is shown, with a "no neighbors match" hint (FR-037 level 3).
- **Focus subject missing after a commit change**: focus auto-clears (toggle off, subject cleared) with a non-blocking notice (FR-021a); during time-lapse, playback continues (FR-031a).
- **Saved layout for a commit whose node set has changed** (nodes added/removed since save): known nodes restore to saved integer-pixel positions; unknown nodes fall back to automatic placement; missing saved nodes are ignored (FR-029).
- **Saved layout with a mismatched persistence schema version**: treated as absent (ignored, no migration), view falls back to automatic layout (FR-029/FR-036).
- **Loading a saved layout when none exists** for the current commit: the action is unavailable or reports "no saved layout".
- **Corrupt or unavailable local storage**: settings/layout reads fall back to defaults without error; saving is disabled with a non-blocking notice (FR-036).
- **No project id available for the layout key**: the key falls back to `repo path or page origin + pathname` so two distinct local projects do not collide on a shared origin (see persistence contract); if even that is unavailable, layout save/load is disabled with a notice.
- **Time-lapse with a single commit**: play and prev/next are disabled with a hint (FR-030).
- **Time-lapse reaching the last commit**: playback stops (pauses) on the last commit, and the control reflects the end state.
- **Narrow/small screens** (container < 900 px): the settings panel becomes a drawer/overlay so the graph stays usable (FR-005).
- **Switching commits with the panel open**: settings persist across the commit change; only graph data reloads.
- **The reference panel includes a "grouping" section** (color groups by query). Grouping is out of scope for this feature (see Assumptions); the panel layout is the reference, not its grouping feature.

## Requirements *(mandatory)*

### Functional Requirements

#### Settings panel & layout (US1)

- **FR-001**: The report MUST present a settings panel docked to the right of the module graph containing exactly five collapsible sections in this order — **Filters, Display, Forces, Focus, Stats** — plus a zoom control group and (last) a time-lapse control group. The panel has a fixed width of 320 px (±20 px) and a header row with the panel title and the collapse + reset controls. "Modeled on the Obsidian Graph View panel" refers to this sectioned, slider/toggle-based layout, not a pixel-exact copy. **US1 deliverable**: the time-lapse group is present below zoom (commit position + disabled play/prev/next/speed); full playback wiring lands in US4 (FR-030/031).
- **FR-001a**: All five sections MUST default to expanded. The expanded/collapsed state of each section is part of persisted settings (FR-003a) and MUST be restored on reload.
- **FR-002**: The panel MUST collapse to a compact toggle — a single gear `ActionIcon` (minimum 32×32 px hit target) with a tooltip "Graph settings" — and re-expand to the same fixed width. No panel-width memory is required because the width is fixed.
- **FR-003**: All settings MUST be held as live UI state; a settings change MUST take effect within the current render frame (no page reload and no network request). Force/layout changes may then animate asynchronously as the simulation re-settles. "Immediately" is this no-reload, no-fetch, same-frame application of the new setting.
- **FR-003a**: Panel settings (filters, display, forces, and per-section expanded state) MUST persist to browser-local storage and auto-restore on a full page reload / new session, in addition to surviving commit changes within a session. Zoom and pan are transient canvas state and are explicitly NOT persisted (see FR-004).
- **FR-003b**: A single "Reset to defaults" control in the panel header MUST reset all three setting groups (filter, display, force) and the per-section expanded state simultaneously to their defaults (see Defaults table). Force-only reset is additionally available in the Forces section (FR-025).
- **FR-004**: Zoom in, zoom out, and fit-to-view controls MUST be available from the panel (relocated from their current placement), in addition to existing pan/zoom interactions on the canvas. Zoom/fit are transient canvas controls: they change the view immediately but are NOT part of persisted settings and are NOT subject to FR-003a restoration.
- **FR-005**: When the panel is expanded, the graph canvas MUST retain at least 60% of the available container width. When the container width is below 900 px, the panel MUST instead render as a `Drawer`/overlay opened by the same toggle, so the canvas keeps the full width underneath.

#### Relationship filters (US1)

- **FR-006**: The Filters section MUST render one on/off toggle per relationship kind, **data-driven** from the breakdown kinds present in the loaded edge data. The kinds currently produced by the active (Odoo) profile are `model_reuse`, `extension_or_method`, `view`, `field_property`; a kind absent from the data MUST NOT render a toggle, and a future profile's kinds MUST render without spec changes. The fixed list in this requirement is the current profile's set, not a hard-coded UI constant (see Assumptions).
- **FR-007**: When a relationship kind is disabled, its contribution MUST be excluded from each edge's effective visible weight.
- **FR-008**: An edge MUST be hidden when its effective weight (after disabled kinds are excluded) falls below the "minimum edge points" threshold.
- **FR-009**: The Filters section MUST provide a "minimum edge points" slider and an "include zero-score edges" toggle; the existing zero-score toggle from the report MUST be relocated here as the primary control with identical semantics (it controls whether edges with effective score 0 are eligible to display, exactly as today). The slider range is `0..maxEffectiveScore`, where `maxEffectiveScore` is the maximum effective score across currently loaded edges (dynamic), with integer step 1. When `maxEffectiveScore` is 0, the slider is disabled at 0.
- **FR-010**: Edge thickness MUST be derived from the effective visible weight, not a fixed total, so it reflects the active filters.
- **FR-011**: When no relationship kinds are enabled, the graph area MUST replace the canvas with a clear "no relationship kinds selected" notice, and the Stats section MUST show visible nodes/edges = 0. This notice takes precedence over any focus/threshold empty-state notice (FR-037).

#### Display settings (US1)

- **FR-012**: The Display section MUST let the analyst toggle directional arrows on edges.
- **FR-013**: The Display section MUST offer a label mode of always / on hover / on selection / none, plus a "label fade threshold" expressed as a minimum zoom scale (range 0.0–2.0, step 0.1, default 0.0). When the current zoom scale is below the threshold, node labels are hidden (instant toggle, not a gradual opacity fade); at the default 0.0 labels are never hidden by zoom.
- **FR-014**: The Display section MUST let the analyst choose the node-size metric from: visible lines, total lines, method count, incoming score, outgoing score, or fixed. A "node-size scale" is a unitless multiplier applied to the computed radius (range 0.5–2.0, step 0.1, default 1.0); `fixed` uses the neutral radius × scale.
- **FR-015**: The Display section MUST let the analyst choose the link-thickness metric from: total points, selected-kind points, score, or fixed. A "link-thickness scale" is a unitless multiplier applied to the computed thickness (range 0.5–2.0, step 0.1, default 1.0).
- **FR-016**: The Display section MUST let the analyst toggle edge labels and node badges. When node badges are on, each node MUST show only facts already present in its loaded data — incoming score, outgoing score, file count, method count. A warning indicator is reserved for a per-node parse-error count: it is shown only when that field is present in the node data and greater than zero. The current `GraphNode` payload does not include a parse-error field, so the warning indicator is not displayed in this version (it activates automatically if a future backend adds the field — no spec change needed; see Assumptions).

#### Stats & legend (US1)

- **FR-017**: The Stats section MUST show, for the **currently visible (filtered + focused) view**: visible nodes and visible edges; alongside the totals for the full loaded graph (total nodes, total edges) and the derived "hidden by filters" count (= total − visible). It MUST also show the selected module and the current focus/depth/direction state. When focus mode is active, "visible" reflects the local subgraph, while totals reflect the full graph, so the analyst can see how much is hidden.
- **FR-018**: A compact legend MUST explain node-size mapping, node-color mapping, edge-thickness mapping, and relationship-kind colors inside the **Stats** section of the settings panel (below the live counters), not as a canvas overlay.

#### Focus & hover (US2)

- **FR-019**: The Focus section MUST provide a "focus selected module" toggle, a depth slider (integer 1..5), a direction selector (both / incoming / outgoing), and a "clear focus" action. "Depth" is the number of relationship hops from the focus subject along the **filtered** edge set; the direction selector governs which edge directions are traversed during that hop expansion (FR-020).
- **FR-020**: When focus is off, the graph MUST show the full global (filtered) graph; when focus is on, it MUST show only the focus subject and its neighbors within the chosen depth, traversing edges per the chosen direction. Execution order is fixed: (1) apply relationship filters (enabled kinds, minimum edge points, zero-score rule) to produce the filtered node/edge set; (2) BFS from the subject over that filtered set to `depth` hops following `direction`. Filter-hidden relationships therefore never pull neighbors into focus.
- **FR-021**: Clicking a node MUST set it as the focus subject (and select it for the detail panels) but MUST NOT by itself enable focus mode; the "focus selected module" toggle remains in its current state until the analyst changes it. Enabling focus with no subject set is a no-op.
- **FR-021a**: When the focus subject is no longer present in the loaded graph after a commit change, focus mode MUST auto-clear (toggle off, subject cleared) and a non-blocking notice MUST inform the analyst that the focused module is absent at this commit.
- **FR-022**: The Display section MUST provide a "fade non-neighbors on hover" toggle; when enabled, hovering a node MUST keep that node, its neighbors, and connecting edges at full opacity (1.0) while fading all other nodes/edges to ≤ 0.2 opacity, and hovering an edge MUST keep that edge and its two endpoints at full opacity while fading the rest. Emphasis/fade transitions complete within ~150 ms and clear on mouse-leave.
- **FR-023**: When hover highlighting is disabled, hovering MUST not alter graph opacity (current behavior preserved).

#### Forces & layout persistence (US3)

- **FR-024**: The Forces section MUST expose adjustable controls for center/attraction force, repel force, link strength, link distance, collision padding, and velocity decay, replacing the current hard-coded layout parameters.
- **FR-025**: The Forces section MUST provide "restart layout" (re-run the simulation) and "reset forces" (return to defaults) actions.
- **FR-026**: Double-clicking a node MUST pin/unpin it; a pinned node MUST keep its position across layout restarts and show a visual pinned marker. Because double-click is unreliable on touch/trackpad and for accessibility, the panel MUST also offer a pin/unpin control for the currently selected module (keyboard-activatable), providing an equivalent path to FR-026.
- **FR-027**: The panel MUST provide four distinct layout actions with defined scope:
  - **Save layout** — write current node positions + pinned flags to local storage for the current project+commit (FR-028).
  - **Load saved layout** — restore positions/pins from local storage for the current project+commit (FR-029).
  - **Reset layout** — a **permanent** reset: clear in-memory positions/pins **and delete** the saved local-storage entry for the current project+commit, then re-run automatic layout.
  - **Unpin all** — a **transient** action: clear pinned flags / fixed coordinates on all in-memory nodes only; it does NOT modify any already-saved layout until the analyst explicitly saves again.
- **FR-028**: A saved layout MUST persist to browser-local storage, keyed per project/repository and commit, so reopening the same commit can restore the saved node positions and pins.
- **FR-029**: When restoring a saved layout whose node set has changed, known nodes MUST restore to saved positions (rounded to the saved integer pixel coordinates) while unknown nodes fall back to automatic placement and saved entries with no matching current node are ignored. A stored layout whose persistence schema version does not match the current version MUST be treated as absent (ignored, no migration) and MUST NOT corrupt the view.

#### Commit time-lapse (US4)

- **FR-030**: The panel MUST offer time-lapse controls — play/pause, previous commit, next commit, and speed — driven by the existing commit list. When only one commit is available, the play and prev/next controls MUST be disabled with a short hint that time-lapse needs at least two commits.
- **FR-031**: While playing, the report MUST advance the selected commit on an interval and redraw the graph for each commit, always displaying the current commit's order, short hash, and summary, plus its position in the sequence (e.g. "3 / 12"); upon reaching the last commit, playback MUST stop (pause) on that commit rather than looping.
- **FR-031a**: When focus mode is active during time-lapse, the focus subject MUST persist across commit transitions; if the subject is absent at the new commit, the auto-clear rule (FR-021a) applies and playback continues.

#### Empty states & precedence

- **FR-037**: The graph area empty-state notices have a fixed precedence: (1) "no relationship kinds selected" (FR-011) outranks all others; otherwise (2) when filters/threshold leave zero visible edges but kinds are enabled, an "all edges below threshold" notice is shown (distinct from FR-011) while nodes remain visible; otherwise (3) in focus mode with a valid subject but no qualifying neighbors at the chosen depth/direction, only the subject is shown with a "no neighbors match" hint. At most one notice is shown at a time, by this order.

#### Non-regression & defaults

- **FR-032**: All new settings MUST have the explicit default values listed in the **Defaults** table below, chosen so the initial graph is visually and behaviorally equivalent to the pre-feature graph (same node-size, color, and edge-thickness mappings, arrows on, labels always, current force constants) before any setting is changed.
- **FR-033**: The feature MUST require no backend changes for its first version, operating only on the already-loaded fields listed under **Inherited inputs** in Assumptions.

#### Defaults (authoritative; FR-032)

| Setting | Default | Reproduces today |
|---------|---------|------------------|
| Enabled edge kinds | all present kinds enabled | yes |
| Minimum edge points | 0 | yes |
| Include zero-score edges | off | matches current report default |
| Focus enabled / depth / direction | off / 1 / both | global graph as today |
| Show arrows | on | yes |
| Label mode / fade threshold | always / 0.0 | labels always shown as today |
| Node-size metric / scale | visible lines / 1.0 | current line-category sizing |
| Link-thickness metric / scale | total points / 1.0 | current `breakdown.total` thickness |
| Fade non-neighbors | off | current no-fade hover |
| Show edge labels / node badges | off / off | none shown today |
| Force: center / repel / collide padding / velocity decay | 0.05 / −900 / 6 / 0.88 | current `ModuleGraph` constants |
| Force: link strength / link distance | current formula baselines | current `ModuleGraph` link force |
| Section expanded state | all five expanded | n/a (new) |

Persisted as `sectionsExpanded: Record<"filters" | "display" | "forces" | "focus" | "stats", boolean>` (FR-001a/FR-003a).

### Non-Functional Requirements

- **FR-034 (Accessibility)**: All panel controls MUST be keyboard-navigable in a logical order; sliders, toggles, and segmented controls MUST expose accessible names/labels (ARIA) describing the setting they control; the pin/unpin control (FR-026) MUST be keyboard-activatable. In hover-highlight mode, emphasized elements MUST remain distinguishable from faded ones for low-vision users via the defined opacity differential (FR-022), not color alone.
- **FR-035 (Scale & responsiveness)**: Settings, filter, and hover-highlight updates MUST feel instant (same-frame application, FR-003) for graphs up to ~500 nodes and ~2,000 edges; beyond that, behavior MUST degrade gracefully (no crash, no lost interactivity) without a hard performance guarantee. This is the supported interactive scale for this feature.
- **FR-036 (Persistence resilience)**: Corrupt, unparseable, or version-mismatched local-storage values (settings or layout) MUST be treated as absent and fall back to defaults without throwing into the UI; unavailable/full storage MUST disable saving with a non-blocking notice (settings still work in-session).

### Key Entities *(include if feature involves data)*

- **Graph filter state**: which relationship kinds are enabled, the minimum edge points threshold, the zero-score inclusion flag, and the focus parameters (focus subject, focus on/off, depth, direction).
- **Graph display state**: arrow visibility, label mode and fade threshold, node-size metric and scale, link-thickness metric and scale, fade-non-neighbors flag, edge-label and node-badge visibility.
- **Graph force state**: center/attraction, repel, link strength, link distance, collision padding, and velocity decay values used by the layout.
- **Saved layout**: per-project/repository-and-commit record of node positions and pinned state, stored locally for later restoration.
- **Time-lapse state**: play/pause status, current commit position, and playback speed over the existing commit list.
- **Graph stats**: derived counts of total/visible nodes and edges, hidden-by-filter counts, the selected module, and the current focus/depth state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an open report, an analyst can reach every graph control (filter, display, force, focus, stats, zoom) from one panel without leaving the graph view.
- **SC-002**: An analyst can reduce a dense graph to a chosen relationship kind and weight threshold in under 30 seconds of **user interaction time** (excluding layout animation/render time), and the visible-edge count and legend confirm exactly what remains.
- **SC-003**: With the panel already open, an analyst can isolate any module's neighborhood at a chosen depth and direction in three interactions or fewer, counted as: (1) click the node, (2) toggle focus on, (3) set depth/direction. Opening the panel is not counted.
- **SC-004**: Hovering any node makes its direct relationships distinguishable at a glance via the defined opacity differential — neighbors/edges at opacity 1.0 versus non-neighbors at ≤ 0.2 (FR-022).
- **SC-005**: An analyst can pin nodes, save a layout, reopen the same commit, and recover the saved arrangement and pins with no manual re-positioning; the criterion passes when all nodes present at save time return to their saved integer-pixel coordinates and nodes added since the save are auto-placed (partial-match per FR-029 is acceptable).
- **SC-006**: Given at least two commits, an analyst can replay the graph across all available commits and stop on any commit, always seeing the current commit's order, short hash, and sequence position (FR-031).
- **SC-007**: With no settings changed (defaults per the Defaults table), the graph's node-size, color, and edge-thickness mappings, arrow/label visibility, and layout for a given commit are equivalent to the pre-feature graph for that same commit; the baseline for judging this is the same commit rendered by the pre-feature `ModuleGraph` with its prior hard-coded constants.
- **SC-008**: 100% of the listed capabilities operate on already-loaded report data with no backend change required.

## Assumptions

- This feature builds on the graph restored in feature `002-restore-ui-metrics` (the existing module graph, report/snapshot page, and graph node/edge data shape); that surface is the integration point.
- **Inherited inputs (stable, guaranteed by feature 002; basis for FR-033)**: `GraphNode` provides `module_name`, `total_lines`, `line_categories`, `python_file_count`, `method_count`, `cyclomatic_median`, `cognitive_median`, `jones_median`, `score_in`, `score_out`. `GraphEdge` provides `source`, `target`, `score`, `breakdown`, optional `kinds`/`kind_occurrence_count`/`evidence_count`/`commit_hash`. `EdgeBreakdown` provides `model_reuse`, `extension_or_method`, `view`, `field_property`, `total`. Every display metric, filter, and badge in this feature maps to one of these fields; no field outside this set is required (a parse-error field is explicitly absent, see FR-016). If feature 002's payload changes these fields, this feature must be revisited.
- The filterable relationship kinds are derived **at runtime from the kinds present in the loaded edge breakdown**, not hard-coded in the panel; this is exercised by FR-006's acceptance (a kind absent from the data renders no toggle). The four kinds listed in FR-006 are the active Odoo profile's current set.
- The reference screenshot defines the **panel layout and interaction style** (collapsible sections, sliders, toggles, search/reset/close affordances), not a literal one-to-one feature copy of Obsidian.
- The Obsidian "grouping / new group" capability (coloring node groups by query) shown in the reference is **out of scope** for this feature; only the listed sections (Filters, Display, Forces, Focus, Stats) are required.
- Panel settings (filters/display/forces) and saved layouts are persisted in browser-local storage for the MVP; settings auto-restore on reload, while saved layouts are keyed by project/repository plus commit. Cross-device sync and server-side persistence are out of scope.
- The relationship kinds available for filtering are those already present in the loaded edge data (model reuse, extension/method, view, field/property); no new kinds are introduced.
- Node badges and warning indicators show only facts already available in the loaded data; fields not yet provided by the backend are simply omitted until a later backend change adds them.
- Time-lapse reuses the existing commit list and per-commit reload path; it does not require precomputed animation data.
- The first version targets the browser report; reuse inside an IDE/Webview context follows the same generic UI and is not separately specified here.
