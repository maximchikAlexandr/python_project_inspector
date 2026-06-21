# Phase 0 Research: Graph Explorer UI

All decisions are frontend-only and constrained by FR-033 (no backend change) and FR-032 (defaults reproduce today's graph). No `NEEDS CLARIFICATION` remained after `/speckit-clarify`; the three answered questions are folded in below.

## D1. Data shaping extracted into pure selectors

- **Decision**: Add `frontend/src/components/graphSelectors.ts` with React-free functions: `computeEdgeVisibleScore(edge, enabledKinds)`, `applyGraphFilters(nodes, edges, filterState) -> { nodes, edges, stats }`, `computeLocalGraph(nodes, edges, focusModule, depth, directionMode) -> { nodes, edges }`, `computeNodeDisplay(node, settings, context) -> NodeDisplayModel`, `computeEdgeDisplay(edge, settings, context) -> EdgeDisplayModel`. `ModuleGraph` receives already-filtered nodes/edges plus display/force state.
- **Rationale**: Mirrors Constitution Principle I (functional core) in the frontend, makes filtering/focus unit-testable without a renderer, and shrinks `SnapshotPage`/`ModuleGraph` (FR/AC item 17 in the source doc).
- **Alternatives rejected**: Keeping all logic inside `ModuleGraph` (current state) — untestable, conflates layout with data; computing in `SnapshotPage` inline — bloats the page and duplicates work.

## D2. Effective edge score and edge-kind filtering

- **Decision**: Effective visible score = sum of `EdgeBreakdown` components for **enabled** kinds (`model_reuse`, `extension_or_method`, `view`, `field_property`). An edge is hidden when effective score `< minEdgeScore`, or when it is zero and `includeZeroScore` is false. Edge thickness uses the effective score, not `breakdown.total`.
- **Rationale**: Directly satisfies FR-007/008/010; the four components already exist on every `GraphEdge.breakdown`, so no backend data is required.
- **Alternatives rejected**: Filtering on raw `edge.score` (can't attribute to a kind); using `breakdown.total` for thickness (ignores active filters, contradicts FR-010).

## D3. Filters compose before focus subgraph (Clarification)

- **Decision**: `applyGraphFilters` runs first; `computeLocalGraph` then walks the **already-filtered** edge set via BFS to `depth`, following edges per `directionMode` (`both`/`incoming`/`outgoing`).
- **Rationale**: Clarification session 2026-06-21 — filter-hidden relationships must not pull neighbors into focus (FR-020). BFS over the filtered set guarantees consistency between Stats, legend, and what is drawn.
- **Alternatives rejected**: Building the local subgraph on all edges then filtering (would surface neighbors reachable only via hidden edges); ignoring filters in focus mode (rejected option C in clarify).

## D4. Settings state shape, defaults, and persistence

- **Decision**: Three typed groups in `graphSettingsTypes.ts` — `GraphFilterState`, `GraphDisplayState`, `GraphForceState` — with a `DEFAULT_*` for each chosen to reproduce the current graph (all kinds enabled, `minEdgeScore = 0`, arrows on, label mode `always`, node size = visible lines, link thickness = total points, fade-non-neighbors off, current d3 force constants). `useGraphSettings.ts` holds them in React state, persists the merged object to a single `localStorage` key, and auto-restores on mount with a defaults merge (forward-compatible if new fields appear). A `reset()` clears to defaults.
- **Rationale**: FR-003/003a/032; merging persisted values over defaults avoids breakage when the settings schema grows.
- **Alternatives rejected**: No persistence (fails FR-003a); persisting per-commit (settings are global UX preferences, not per-commit data — only layouts are per-commit, see D7); URL/query-param state (heavier, shareable-link feature not requested).

## D5. Display-driven rendering (size, thickness, arrows, labels, badges)

- **Decision**: `ModuleGraph` reads node-size metric (`visible_lines`/`total_lines`/`method_count`/`score_in`/`score_out`/`fixed`) and link-thickness metric (`total_points`/`selected_kind_points`/`score`/`fixed`) from settings, with a scale multiplier. Node radius keeps the existing `sqrt`-scaled mapping (`computeNodeRadiusMap` generalized to any metric value). Arrows toggle the existing `marker-end`. Label modes (`always`/`hover`/`selected`/`none`) and the fade threshold (hide labels when zoom/size below a point) gate the existing label `<text>`. Edge labels and node badges are opt-in overlays showing only already-available facts (`score_in`/`score_out`/`python_file_count`/`method_count`).
- **Rationale**: FR-012..016; reuses existing radius/label machinery, so default appearance is unchanged.
- **Alternatives rejected**: A charting/graph library swap (overkill, breaks current SVG renderer and FR-032); recomputing radii in React on every hover (perf).

## D6. Hover highlight and fade — imperative, not React state

- **Decision**: Precompute an adjacency map (from filtered edges) once per data/settings change. On node/edge `mouseenter`, set opacity/dim CSS on the relevant SVG groups/paths imperatively (via the existing `nodeGroupRefs`/`linkPathRefs`), clearing on `mouseleave`. Gated by the `fadeNonNeighbors` display toggle (off = today's behavior).
- **Rationale**: FR-022/023; the graph already mutates DOM imperatively per tick — routing hover through React state would re-render hundreds of nodes per mouse move.
- **Alternatives rejected**: React state `hoveredId` driving re-render (jank at scale); CSS `:hover` sibling selectors (can't express neighbor sets).

## D7. Pinning and per-commit layout persistence

- **Decision**: Double-click toggles a node's pinned flag; pinned nodes keep `fx/fy` across `alpha().restart()` and show a small marker. `useGraphLayoutStore.ts` saves `{ [moduleName]: { x, y, pinned } }` to `localStorage` under a per-project/commit key. Save/Load/Reset/Unpin-all are panel buttons. On load, known nodes restore `x/y` (and `fx/fy` if pinned); unknown nodes fall back to automatic placement; missing saved entries are ignored (FR-029).
- **Rationale**: FR-026..029; current drag clears `fx/fy` on mouseup — pinning is the intentional opposite and the natural persistence unit.
- **Project/commit key**: Use the report's project/repository identity when available (e.g. from `/api/status` `project_id`), else fall back to commit hash + page origin, per the source doc.
- **Alternatives rejected**: Auto-save every layout (surprising, churns storage); server-side layout storage (violates FR-033/scope).

## D8. Position-preserving re-layout when the visible set changes

- **Decision**: When filters/focus change the visible node set, seed retained nodes from the current `positionsRef` instead of re-randomizing, and only randomize genuinely new nodes; nudge the simulation with a low `alpha` rather than a full re-init.
- **Rationale**: Prevents the whole graph from "jumping" every time a filter toggles, keeping focus/filter interactions legible (supports SC-002/003); also preserves pinned positions.
- **Alternatives rejected**: Current behavior re-seeds all nodes randomly on `nodeSignature` change (disorienting under frequent filtering).

## D9. Forces wired to state with restart/reset

- **Decision**: Replace hard-coded constants (`forceManyBody(-900)`, `forceCenter(...).strength(0.05)`, link distance/strength formulas, `forceCollide(+6)`, `velocityDecay(0.88)`) with values from `GraphForceState`. Slider changes update the live forces in place and `alpha().restart()`; "Restart layout" re-runs the simulation; "Reset forces" restores `DEFAULT_FORCE_STATE`.
- **Rationale**: FR-024/025; in-place force updates avoid rebuilding the simulation and losing positions/pins.
- **Alternatives rejected**: Rebuilding the simulation per slider tick (loses layout/pins, janky).

## D10. Panel layout, collapse, and responsiveness

- **Decision**: `GraphSettingsPanel` uses Mantine `Paper` + `Accordion` sections (Filters/Display/Forces/Focus/Stats) docked right of the graph in a flex row; a header `ActionIcon` collapses it to a compact "graph settings" button. Below a width breakpoint it renders inside a Mantine `Drawer` opened by the same toggle. Zoom-in/out/fit and time-lapse controls live in the panel (with canvas pan/zoom preserved).
- **Rationale**: FR-001/002/004/005; matches the Obsidian reference's sectioned, collapsible layout using components the repo already depends on.
- **Alternatives rejected**: A floating absolutely-positioned overlay only (covers the graph on small screens); a new modal (breaks "settings beside the graph").

## D11. Commit time-lapse reuses existing commit list

- **Decision**: `SnapshotPage` already owns `commits` and `selectedCommit`; time-lapse advances `selectedCommit` along ordered commits on an interval (speed-controlled), with play/pause and prev/next, and **stops on the last commit** (Clarification — no loop). Each step reuses the existing per-commit fetch/redraw path.
- **Rationale**: FR-030/031; no precomputed animation data needed (Assumptions), minimal new state.
- **Alternatives rejected**: Looping playback (rejected in clarify); prefetching/diffing all commits (scope creep for MVP).

## D12. Generic / registry-driven options (Constitution IV)

- **Decision**: Edge-kind keys/labels/colors and the node-size/link-thickness metric option lists are sourced from `registry/odooProfile.ts` (extended additively), not hard-coded inside the panel. The panel renders whatever kinds/metrics the registry/data expose.
- **Rationale**: Keeps the UI profile-agnostic per Principle IV; a future non-Odoo profile gets the same panel for free.
- **Alternatives rejected**: Hard-coding the four Odoo breakdown labels in the panel JSX (violates the generic-UI mandate).

## D14. Remeda as the mandated FP library for TypeScript pure core

- **Decision**: Add [`remeda`](https://github.com/remeda/remeda) 2.x to `frontend/package.json`. All pure transforms in `graphSelectors.ts`, remeda-eligible helpers in `registry/odooProfile.ts`, and persistence merge utilities MUST use remeda (`pipe`, `map`, `filter`, `sumBy`, `clamp`, …) instead of imperative loops or ad-hoc reduce chains. As preparatory work in this feature, refactor existing pure functions in `odooProfile.ts` to remeda with no behavior change.
- **Rationale**: Aligns the frontend FP core with the constitution's functional-core intent and Python's `toolz`/`pipe` stack; remeda is tree-shakable, first-class TypeScript, supports data-first pipelines suited to selector composition. Establishes one library convention before `graphSelectors.ts` is written.
- **Alternatives rejected**: Raw `Array.prototype` only (no shared pipeline discipline); Ramda (heavier, weaker TS inference); Lodash (not FP-first, mutable-friendly); no library (inconsistent style across selectors).

## D15. Full TypeScript FP refactor (frontend-wide, where appropriate)

- **Decision**: Extend the graph-explorer FP split to the entire `frontend/src` tree per [fp-refactor-plan.md](./fp-refactor-plan.md): extract page derivations into `transforms/*` (remeda); keep d3/DOM/fetch/React events in shell modules. Six phases from graph core through snapshot/structure/report/analytics/treemap.
- **Rationale**: One remeda convention project-wide; pages duplicate commit-option mapping and filter loops; pure transforms are testable without touching React.
- **Alternatives rejected**: FP-only the graph and leave other pages imperative; fp-ts everywhere; monolithic utils dump.

## D13. Testing approach for the MVP

- **Decision**: Manual browser smoke test against the fixture report (as in feature 002). Keep `graphSelectors.ts` pure so unit tests can be added later; do **not** add a frontend test runner in this feature.
- **Rationale**: Matches feature 002's stated MVP testing posture; avoids introducing tooling scope.
- **Alternatives rejected**: Standing up Vitest + jsdom now (tooling scope beyond this UI feature; can follow later).
