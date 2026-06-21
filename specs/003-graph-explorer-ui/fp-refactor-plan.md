# FP Refactor Plan: Full TypeScript Frontend (where appropriate)

**Feature**: `003-graph-explorer-ui`  
**Principle**: Functional core, imperative shell (Constitution I) — frontend edition  
**Toolkit**: [remeda](https://github.com/remeda/remeda) 2.x for all pure transforms  
**Status**: Planning artifact; execution is part of feature 003 implementation + a final cross-frontend pass

## Goal

Refactor the **entire** `frontend/src` TypeScript codebase so that:

1. **All decision logic and data shaping** lives in pure, testable modules (`transforms/`, `graphSelectors.ts`, registry helpers).
2. **React pages/components** become thin shells: hooks for I/O/state + `useMemo(() => pureFn(...))` + JSX.
3. **Imperative/platform code** (d3 simulation ticks, DOM ref writes, `fetch`, `localStorage` I/O, event handlers) stays where it belongs and does **not** import remeda.

This is **not** “eliminate all loops and classes everywhere” — it is **maximal FP where data transforms, minimal OO/imperative where the runtime demands effects**.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Shell (imperative / React / platform)                      │
│  pages/*, components/*Graph*, hooks, api/client.ts          │
│  — useState/useEffect, fetch, d3 tick → DOM, localStorage   │
└───────────────────────────┬─────────────────────────────────┘
                            │ calls
┌───────────────────────────▼─────────────────────────────────┐
│  Functional core (pure, remeda)                             │
│  transforms/*, components/graphSelectors.ts,                │
│  registry/odooProfile.ts, utils/metricFormat.ts             │
│  — pipe/map/filter/sumBy; no I/O; immutable in/out          │
└─────────────────────────────────────────────────────────────┘
```

**Rules**

| Layer | May use remeda | May mutate | May I/O |
|-------|----------------|------------|---------|
| `transforms/`, `graphSelectors.ts`, registry pure fns | ✅ | ❌ | ❌ |
| Hooks (`useGraphSettings`, layout store) | ✅ only for merge/parse pure steps | refs ok | ✅ at boundary |
| React components (JSX) | ❌ (call pure fns via useMemo) | ❌ | via hooks only |
| `ModuleGraph` d3/DOM loop | ❌ | ✅ local sim/DOM | ❌ |
| `api/client.ts` | ❌ | ❌ | ✅ fetch |

---

## Target directory layout

```text
frontend/src/
├── api/
│   └── client.ts                    # Shell: fetch only (no refactor of transport)
├── transforms/                      # NEW: cross-page pure modules
│   ├── commitOptions.ts             # commits → Select options
│   ├── snapshotTransforms.ts        # SnapshotPage derivations
│   ├── structureTransforms.ts       # StructurePage edge/kind filters
│   ├── analyticsTransforms.ts       # AnalyticsPage diffs & chart rows
│   ├── reportTransforms.ts          # ReportTables row building & filters
│   └── treemapTransforms.ts         # Treemap layout leaves & colors (pure)
├── components/
│   ├── graphSelectors.ts            # Graph explorer pure core (feature 003)
│   ├── graphSettingsTypes.ts
│   ├── graphPersistence.ts          # Pure parse/serialize/merge (no localStorage)
│   ├── useGraphSettings.ts          # Shell: thin hook → graphPersistence + state
│   ├── useGraphLayoutStore.ts       # Shell: I/O wrapper around pure layout model
│   ├── ModuleGraph.tsx              # Shell: d3 + DOM; imports graphViewPure only
│   ├── graphViewPure.ts             # NEW: edge path math, viewBox, tooltips (extracted)
│   └── … (presentational — no logic extract unless filter/sort)
├── registry/
│   └── odooProfile.ts               # Pure metrics (remeda — partial done)
└── utils/
    └── metricFormat.ts              # Pure formatters (optional remeda pipe)
```

---

## Module inventory

### ✅ Pure core — refactor to remeda (mandatory)

| Current location | Extract / refactor to | Pure functions | Priority |
|------------------|----------------------|----------------|----------|
| `registry/odooProfile.ts` | same file | `lineCategoryTotal`, `computeNodeRadiusMap`, `normalizeValues`, `computeNodeBrightnessMap`, `moduleCouplingStats` | **P0 done**; finish `isScoringEdgeKind` helpers if touched |
| `components/graphSelectors.ts` | **new** | `computeEdgeVisibleScore`, `applyGraphFilters`, `computeLocalGraph`, `computeNodeDisplay`, `computeEdgeDisplay` | **P0** (US1–2) |
| `components/graphPersistence.ts` | **new** | `parseSettings`, `serializeSettings`, `mergeSettingsWithDefaults`, `parseLayout`, `layoutStorageKey` | **P0** (US3) |
| `pages/SnapshotPage.tsx` | `transforms/snapshotTransforms.ts` | `graphEdgesToRows`, `visibleLinesTotal`, `moduleOptionsFromModules`, `selectedCategoryLabels`, `commitOptions` reuse | **P1** |
| `pages/StructurePage.tsx` | `transforms/structureTransforms.ts` | `kindOptionsFromEdges`, `filterEdges`, `moduleOptionsFromEdges` | **P1** |
| `components/ReportTables.tsx` | `transforms/reportTransforms.ts` | `buildKindRows`, `filterModuleLines`, `filterFiles`, `filterKindRows`, `chunkPairs` | **P1** |
| `pages/AnalyticsPage.tsx` | `transforms/analyticsTransforms.ts` | `buildComplexityDiff`, `edgeKindChartRows`, `edgeKindSeriesMeta` | **P2** |
| `components/FileTreemap.tsx` | `transforms/treemapTransforms.ts` | `folderColor`, `fileTooltip`, `truncateText`, `layoutTreemapLeaves` (d3 layout call isolated) | **P2** |
| `components/ModuleGraph.tsx` | `components/graphViewPure.ts` | `edgeStrokeWidth`, `buildEdgeTooltip`, `buildNodeTooltip`, `computeTargetViewBox`, `edgeCurvePath`, `clamp` → remeda | **P1** (with graph work) |
| `transforms/commitOptions.ts` | **new** | `toCommitSelectOptions(commits, labelFn?)` — dedupe 4 pages | **P2** |

### 🟡 Shell — thin wiring only (refactor callers, not internals)

| Module | Action |
|--------|--------|
| `pages/SnapshotPage.tsx` | Replace inline `useMemo` bodies with `transforms/*`; add graph settings hook; **no business rules in JSX** |
| `pages/StructurePage.tsx` | Same |
| `pages/AnalyticsPage.tsx` | Same |
| `pages/DashboardPage.tsx` | Extract chart row shaping if any loops remain |
| `components/ReportTables.tsx` | Keep React state; move `buildKindRows` + batch orchestration split (pure chunking vs async fetch shell) |
| `components/GraphSettingsPanel.tsx` | **new** — presentational; callbacks only |
| `components/*Toolbar.tsx`, `*Panel.tsx`, `*View.tsx` | Leave as-is unless they contain filter/sort logic |
| `hooks/useGraphSettings.ts`, `useGraphLayoutStore.ts` | I/O at edge; `mergeDeep` for settings |

### ⛔ Do not FP-refactor (imperative by nature)

| Module | Reason |
|--------|--------|
| `components/ModuleGraph.tsx` — simulation tick, `linkPathRefs`/`nodeGroupRefs` DOM sync, drag/pan handlers | d3 + DOM mutation per frame; extracting **math** only (`graphViewPure.ts`) |
| `components/FileTreemap.tsx` — `ResizeObserver`, click/hover handlers | platform lifecycle |
| `api/client.ts` | transport boundary |
| `navigation.tsx`, `App.tsx`, `main.tsx` | routing/bootstrap |
| `components/MetricChart.tsx`, Mantine tables | presentational |

---

## Execution phases (aligned with feature 003 + full-TS pass)

### Phase 0 — Foundation ✅ (partial)

- [x] Add `remeda` dependency
- [x] Refactor `odooProfile.ts` pure helpers
- [x] Document FP rules in `plan.md`, `contracts/graph-selectors.md`, `research.md` D14

### Phase 1 — Graph explorer pure core (P0, US1–2)

**Deliverables**

- `graphSelectors.ts` — full remeda pipelines (filter → focus → stats → display models)
- `graphSettingsTypes.ts` + `graphPersistence.ts` (pure parse/merge)
- `useGraphSettings.ts` — shell hook
- `SnapshotPage` — `useMemo(() => applyGraphFilters(...))` only
- `graphViewPure.ts` — extract math from `ModuleGraph.tsx`

**Acceptance**: no filter/focus/display logic remains in `ModuleGraph` or `SnapshotPage` outside `useMemo` → pure fn.

### Phase 2 — Graph layout & persistence (P0, US3)

- `useGraphLayoutStore.ts` — I/O shell
- Pure layout model in `graphPersistence.ts`
- `ModuleGraph` keeps d3 pin/`fx/fy` but position restore calls pure merge

### Phase 3 — Snapshot & structure transforms (P1)

- `transforms/snapshotTransforms.ts` + `structureTransforms.ts`
- Refactor `SnapshotPage`, `StructurePage` to import transforms
- `transforms/commitOptions.ts` shared helper

**Acceptance**: pages contain no `.reduce` / nested `for` for derivations; grep `frontend/src/pages` shows only hooks + transform imports.

### Phase 4 — Report & analytics transforms (P1–P2)

- `transforms/reportTransforms.ts` — `buildKindRows`, table filters, `chunkPairs` (pure)
- `ReportTables.tsx` — async batch loop stays in component; chunking logic pure
- `transforms/analyticsTransforms.ts` — `buildComplexityDiff`, chart pivot rows

### Phase 5 — Treemap & remaining pure extracts (P2)

- `transforms/treemapTransforms.ts`
- `utils/metricFormat.ts` — optional `pipe` for `formatStatsLine`
- `DashboardPage` chart shaping if applicable

### Phase 6 — Verification & guardrails

- `npm run build` (tsc + vite)
- Manual smoke: Snapshot, Structure, Analytics pages unchanged in behavior
- Optional (future): add Vitest only for `transforms/` + `graphSelectors.ts`
- Code review gate: **new pure logic without remeda is rejected**

---

## Remeda conventions (project-wide for pure modules)

```ts
import { clamp, filter, map, pipe, sumBy, unique, sortBy, mergeDeep } from "remeda";

// Prefer pipe for multi-step derivations
export function visibleLinesTotal(modules: ModuleSnapshot[], active: Set<LineCategoryKey>): number {
  return sumBy(modules, (module) => lineCategoryTotal(module.line_categories, active));
}

// Prefer filter + map over for-loops with push
export function buildKindRows(payload: EdgePointsResponse): KindRow[] {
  return pipe(
    Object.entries(payload.kinds ?? {}),
    (entries) => filter(entries, ([kind, points]) => isScoringEdgeKind(kind) && points > 0),
    (entries) =>
      map(entries, ([kind, points]) => ({
        source: payload.source,
        target: payload.target,
        kind,
        points,
        total: payload.breakdown.total,
        evidence: filter(payload.evidence ?? [], (item) => item.kind === kind),
      })),
    (rows) => sortBy(rows, [(row) => -row.points, "kind"]),
  );
}
```

**Do not use remeda for**: d3 tick callbacks, `requestAnimationFrame` loops, `useEffect` bodies that call `fetch`, event handlers.

---

## Explicit out of scope

- Refactoring Python backend (FR-033; separate constitution stack: `toolz` + `Expression`)
- Converting React components to non-React FP UI framework
- Replacing d3-force with a pure layout solver
- Introducing classes / OOP hierarchy for graph nodes
- Full rewrite of `api/client.ts` to fp-ts TaskEither (over-engineering for this project)
- Vitest setup in feature 003 MVP (optional follow-up)

---

## Success criteria for “full TS FP refactor complete”

1. **grep gate**: no `for (` / `.reduce(` in `frontend/src/pages/` and `frontend/src/transforms/` except where documented (async batch in ReportTables shell only).
2. **All new/changed pure modules** import remeda for collection transforms.
3. **`graphSelectors.ts` + `transforms/*`** contain 100% of filter/sort/aggregate/chart-row logic used by pages.
4. **`ModuleGraph.tsx`** contains only simulation, DOM sync, and event wiring; math/tooltips/viewBox in `graphViewPure.ts`.
5. **Behavior parity**: SC-007 non-regression + Structure/Analytics manual smoke unchanged.
6. **Build**: `npm run build` green.

---

## Relationship to feature 003 user stories

| User story | FP phase |
|------------|----------|
| US1–2 Settings panel, filters, focus, hover | Phase 1 |
| US3 Forces, pin, layout persistence | Phase 2 |
| US4 Time-lapse | Phase 1 (selector) + Snapshot shell |
| Full TS refactor (this doc) | Phases 3–6 after US1–4 ship or interleaved per task batch |

Phases 3–6 can run **incrementally in the same PR series** as graph explorer work — each page touched for graph features gets its transforms extracted in the same pass.
