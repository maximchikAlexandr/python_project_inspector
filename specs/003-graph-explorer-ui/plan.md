# Implementation Plan: Graph Explorer UI — Right-Side Settings Panel

**Branch**: `003-graph-explorer-ui` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-graph-explorer-ui/spec.md`

## Summary

Turn the existing module dependency graph (restored in feature 002) into an interactive **graph explorer** by adding a right-side, Obsidian-style settings panel beside the canvas. The panel exposes five collapsible sections — Filters, Display, Forces, Focus, Stats — plus relocated zoom/fit controls and (last) a commit time-lapse. All work is **frontend-only**: it layers on the node/edge data the report already loads (`GraphNode`/`GraphEdge`/`EdgeBreakdown`) with **no backend, HTTP, or schema change** (FR-033).

The technical approach extracts the graph's data shaping into a pure, testable selector module and drives `ModuleGraph` from explicit display/force/filter state instead of hard-coded constants:

1. **Pure selectors** (`graphSelectors.ts`): `computeEdgeVisibleScore`, `applyGraphFilters`, `computeLocalGraph`, `computeNodeDisplay`, `computeEdgeDisplay` — React-free functions that take nodes/edges + settings and return filtered nodes/edges + display models + stats. Filters apply **before** the focus subgraph is built (per Clarifications).
2. **Typed settings state + hook** (`graphSettingsTypes.ts`, `useGraphSettings.ts`): three state groups (filter/display/force) with sensible defaults that reproduce today's look (FR-032), persisted to and auto-restored from `localStorage` (FR-003a), plus reset-to-defaults.
3. **Settings panel UI** (`GraphSettingsPanel.tsx`): Mantine `Paper`/`Accordion`/`Switch`/`Slider`/`SegmentedControl`/`ActionIcon` sections, collapsible to a compact toggle, becoming a `Drawer` on narrow screens.
4. **Graph rendering upgrades** (`ModuleGraph.tsx`): consume display/force state; configurable arrows/labels/node-size/link-thickness; hover highlight with fade-non-neighbors; double-click pin/unpin with marker; in-place force updates with restart/reset; position-preserving re-layout when the visible set changes; per-commit layout save/load via `localStorage`.
5. **Stats + legend** and **commit time-lapse** wired through `SnapshotPage.tsx`, which moves the existing "include zero-score" control into the panel and shrinks accordingly.

## Technical Context

**Language/Version**: TypeScript 5.7 / React 18.3 (frontend only; no Python change).

**Primary Dependencies**: Existing — `@mantine/core` 7.x, `d3-force` 3.x, React 18. **New**: [`remeda`](https://github.com/remeda/remeda) 2.x — the mandated FP utility library for all pure TypeScript transforms in this feature (selectors, registry metric helpers, persistence merge). Tree-shakable; no other FP library is added.

**Storage**: Browser `localStorage` for (a) panel settings (single key, auto-restored on load) and (b) saved layouts keyed per project/repository + commit. No DuckDB, server, or schema involvement.

**Testing**: Manual browser smoke test for the MVP (consistent with feature 002). Data-shaping logic is isolated in pure `graphSelectors.ts` functions so it is unit-testable; no frontend test runner is introduced in this feature (out of scope).

**Target Platform**: Local browser report served by `ppi serve`; the same generic UI is reusable in an IDE/Webview later (not separately specified).

**Project Type**: Web frontend (React + Mantine + SVG) inside the single `ppi` package repo; only `frontend/` is touched.

**Performance Goals**: Remain interactive at the existing graph scale (tens–hundreds of modules, up to low-thousands of edges). Settings/filter/hover updates should feel instant; hover highlighting and tick updates manipulate the DOM/CSS imperatively (as the current graph already does) to avoid per-frame React re-renders. No hard performance gate (carried over from feature 002).

**Constraints**: No backend changes (FR-033); UI must stay **generic/registry-driven**, not hard-wired to Odoo (Constitution IV) — edge-kind labels/metric definitions come from `registry/odooProfile.ts`, not the panel; default settings must reproduce the current graph appearance (FR-032); local-only; persistence limited to `localStorage` (no cross-device sync).

**Scale/Scope**: Same per-commit graph sizes as feature 002; one project/commit visualized at a time. Scope is the `frontend/src/{components,pages,registry}` seam.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan complies |
|-----------|--------|------------------------|
| I. Functional Core, OO Shell | PASS | Graph data shaping moves into pure functions in `graphSelectors.ts`, implemented with **remeda** (`pipe`, `map`, `filter`, `sumBy`, …) for immutable collection transforms; React/d3/DOM/localStorage stay in the imperative shell. A preparatory remeda refactor of existing pure helpers in `registry/odooProfile.ts` establishes the pattern. No Python core is touched. |
| II. Layered Core Independence | PASS | Frontend-only change; `core/`, `storage/`, `server/`, `cli/` are untouched. No new core dependency on UI/transport. |
| III. Plugin Extensibility via Fact Contracts | PASS (N/A backend) | No analyzer/metric/edge plugins are added. The feature consumes the existing typed `GraphNode`/`GraphEdge`/`EdgeBreakdown` facts unchanged; no DuckDB writes. |
| IV. CLI-First, Multi-Interface, Generic UI | PASS | No new read is added, so the CLI+HTTP duplication rule does not trigger (FR-033). The "UI MUST be generic" mandate is actively upheld: panel options (edge kinds, node-size/link-thickness metrics, colors) are driven by the registry/profile and the data, not hard-wired Odoo strings in the panel. |
| V. Single-Writer Data Ownership | PASS | No writes to the DuckDB analysis store. `localStorage` is client-side view state, not analysis data; `serve` stays read-only. |
| VI. Typed Contracts & Explicit Errors | PASS | New state uses explicit TypeScript types (`GraphFilterState`/`GraphDisplayState`/`GraphForceState`/`SavedLayout`); selectors are total functions with defined empty/edge-case returns (e.g. "no kinds selected"). No `msgspec`/Pydantic contracts are needed (no IPC/HTTP surface). |

**Code style gates** (NON-NEGOTIABLE, frontend reading): double quotes (already the repo norm); Google-style English docstrings only where functions warrant them, no narrating comments; module-level imports; concise solutions with minimal incidental state. Applied to all new/edited `.ts`/`.tsx`.

Initial gate: **PASS** (no partials). Re-checked post-design (Phase 1): still PASS — the selector extraction strengthens Principle I and the registry-driven panel strengthens Principle IV; no new violations introduced. Complexity Tracking is therefore empty.

## Functional Programming Approach (maximal but appropriate)

Per Constitution Principle I, this feature pushes as much logic as reasonable into pure, immutable transforms and keeps the imperative/OO parts to the irreducible shell. "Appropriate" means we do **not** functional-ize where the platform demands effects (React hooks, the d3 simulation, the SVG DOM, `localStorage`).

### TypeScript (the only code this feature writes)

- **Remeda as the FP toolkit (mandatory)**: all pure collection/object transforms in `graphSelectors.ts`, `registry/odooProfile.ts` metric helpers, and persistence merge utilities MUST use [remeda](https://github.com/remeda/remeda) — prefer `pipe`, `map`, `filter`, `sumBy`, `clamp`, `pick`/`omit`, `mergeDeep`/`merge` over hand-rolled loops, `Array.prototype.reduce` chains, or lodash/ramda. Remeda is tree-shakable and typed for data-first pipelines; it is the frontend counterpart to Python's `toolz` + `Expression.pipe`. React hooks, d3, DOM, and `localStorage` MUST NOT import remeda for side-effectful code — only the pure core does.
- **Pure functional core**: `graphSelectors.ts` contains only pure, total, side-effect-free functions (`computeEdgeVisibleScore`, `applyGraphFilters`, `computeLocalGraph`, `computeNodeDisplay`, `computeEdgeDisplay`), expressed as remeda pipelines where the data flow is non-trivial. They MUST NOT mutate inputs, read `localStorage`/`window`, or touch the DOM.
- **Immutability & expression style**: build new values via remeda transforms and object spread; prefer `const` and `pipe(...)` over reassignment; derive React view-model with `useMemo` wrapping a pure remeda pipeline, not imperative accumulation in components. Settings updates remain immutable patches (`{ ...state, ...patch }`).
- **Data-in/data-out boundaries**: selectors return plain typed records (`NodeDisplayModel`, `EdgeDisplayModel`, `GraphStats`); the renderer consumes them declaratively. No business rules inside JSX.
- **Effects fenced into the shell**: the d3 `forceSimulation`, per-tick DOM writes, hover opacity, pin `fx/fy`, and `localStorage` read/write are inherently effectful and stay in `ModuleGraph`/hooks. We treat them as a thin shell over the pure core, not as a place for logic. Mutation of d3 node objects (`vx/vy/fx/fy`) is local to the simulation step and never leaks into the selector layer.
- **Explicit, total error handling (FP flavor)**: `localStorage`/`JSON.parse` boundaries return a safe default instead of throwing into render (an `Option`-like "absent ⇒ defaults" rule), mirroring the constitution's `Result`/`Option` intent at the TS edge. No exceptions cross the pure boundary.
- **Avoid gratuitous OO**: no classes are introduced; composition of small functions + React function components only.

### Python

- **No Python is written in this feature** (frontend-only, FR-033), so there is nothing to functional-ize here. The repo-wide rule still stands for any later backend follow-on (e.g. persisting layouts server-side): domain logic as pure `facts → metrics → edges → payload` pipelines using `Expression` (`Result`/`Option`/`pipe`) and `toolz`, with I/O/DuckDB/transport confined to the OO shell. This is recorded so the FP expectation is explicit if/when the backend is touched.

**Net**: maximal FP via remeda in the pure core (selectors + registry metric helpers + all `transforms/*`), appropriate effects at the edges, preparatory odooProfile refactor in this feature, same Python discipline deferred until backend work. **Full frontend FP refactor scope** is detailed in [fp-refactor-plan.md](./fp-refactor-plan.md).

## Preparatory refactor (this feature)

- **Done**: existing pure helpers in `frontend/src/registry/odooProfile.ts` refactored to remeda — no behavior change.
- **Planned (full TS, where appropriate)**: see [fp-refactor-plan.md](./fp-refactor-plan.md) — six phases from graph pure core through cross-page `transforms/*` extraction; imperative shell (d3/DOM/fetch/React events) explicitly excluded.

## Project Structure

### Documentation (this feature)

```text
specs/003-graph-explorer-ui/
├── plan.md              # This file
├── research.md          # Phase 0 output (design decisions)
├── data-model.md        # Phase 1 output (settings state entities + defaults)
├── quickstart.md        # Phase 1 output (manual validation scenarios)
├── contracts/           # Phase 1 output
│   ├── graph-settings-state.md   # State groups, defaults, persistence reset
│   ├── graph-selectors.md        # Pure selector function signatures + semantics
│   ├── persistence.md            # localStorage keys + serialized schemas
│   └── component-contracts.md    # ModuleGraph props + panel callback contract
├── fp-refactor-plan.md  # Full TS FP refactor plan (transforms/, phases, inventory)
├── spec.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── transforms/                      # NEW (Phases 3–5): cross-page pure modules — remeda
│   ├── commitOptions.ts
│   ├── snapshotTransforms.ts
│   ├── structureTransforms.ts
│   ├── analyticsTransforms.ts
│   ├── reportTransforms.ts
│   └── treemapTransforms.ts
├── components/
│   ├── graphSelectors.ts          # NEW: graph pure core (Phase 1)
│   ├── graphPersistence.ts        # NEW: pure parse/serialize/merge (Phase 2)
│   ├── graphViewPure.ts           # NEW: viewBox/tooltips/edge math extracted from ModuleGraph
│   ├── GraphSettingsPanel.tsx     # NEW: shell UI
│   ├── graphSettingsTypes.ts      # NEW
│   ├── useGraphSettings.ts        # NEW: thin I/O hook
│   ├── useGraphLayoutStore.ts     # NEW: thin I/O hook
│   ├── ModuleGraph.tsx            # MODIFY: shell only (d3 + DOM); logic → graphSelectors/graphViewPure
├── pages/
│   ├── SnapshotPage.tsx           # MODIFY: thin shell → transforms/ + graphSelectors
│   ├── StructurePage.tsx          # MODIFY (Phase 3): → structureTransforms
│   └── AnalyticsPage.tsx          # MODIFY (Phase 4): → analyticsTransforms
└── registry/
    └── odooProfile.ts             # MODIFY: remeda pure metrics (P0 done) + edge-kind registry
```

**Structure Decision**: Frontend-only feature. Pure logic concentrates in `graphSelectors.ts`, `graphPersistence.ts`, `graphViewPure.ts`, and `transforms/*` (remeda). Pages and `ModuleGraph` are imperative shells (React/d3/DOM/fetch). Full inventory and phases: [fp-refactor-plan.md](./fp-refactor-plan.md).

> No constitution violations. This feature is additive frontend work with no deviations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
