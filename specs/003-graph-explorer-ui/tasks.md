# Tasks: Graph Explorer UI — Right-Side Settings Panel

**Input**: Design documents from `/specs/003-graph-explorer-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, fp-refactor-plan.md

**Tests**: Not requested — manual validation via quickstart.md only (no Vitest tasks).

**Organization**: Tasks grouped by user story (P1–P4) plus FP cross-page refactor and polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependencies)
- **[Story]**: US1–US4 maps to spec.md user stories

## Path Conventions

- Frontend root: `frontend/src/`
- Pure core: remeda in `graphSelectors.ts`, `graphPersistence.ts`, `transforms/*`, `registry/odooProfile.ts`
- Shell: React pages/components, hooks, d3/DOM in `ModuleGraph.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and FP baseline

- [x] T001 Confirm `remeda` in `frontend/package.json` and `npm run build` passes (odooProfile remeda refactor already landed)
- [x] T002 [P] Skim `specs/003-graph-explorer-ui/fp-refactor-plan.md` and `contracts/graph-selectors.md` before implementing pure modules

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Typed settings, pure persistence, selector core, and extracted graph math — **MUST complete before user stories**

**⚠️ CRITICAL**: No user story work until this phase is done

- [x] T003 Create `frontend/src/components/graphSettingsTypes.ts` with `GraphFilterState`, `GraphDisplayState`, `GraphForceState`, `GraphSettings`, `sectionsExpanded` (`filters`/`display`/`forces`/`focus`/`stats`), and `DEFAULT_*` per spec Defaults table (FR-001a/FR-032)
- [x] T004 Create `frontend/src/components/graphPersistence.ts` with pure `parseSettings`, `serializeSettings`, `mergeSettingsWithDefaults`, `layoutStorageKey`, `parseLayout`, `serializeLayout` using remeda `mergeDeep` per `contracts/persistence.md`; **FR-036**: corrupt/unparseable JSON and version mismatch → defaults silently; `QuotaExceededError`/unavailable storage → `{ saveDisabled: true }` without throwing
- [x] T005 Create `frontend/src/components/useGraphSettings.ts` hook (localStorage I/O shell → `graphPersistence.ts`) per `contracts/graph-settings-state.md`; persist/restore `sectionsExpanded`; surface non-blocking notice when `saveDisabled` (FR-036)
- [x] T006 [P] Extract `frontend/src/components/graphViewPure.ts` from `frontend/src/components/ModuleGraph.tsx` (edgeStrokeWidth, buildEdgeTooltip, buildNodeTooltip, computeTargetViewBox, edgeCurvePath)
- [x] T007 Implement `frontend/src/components/graphSelectors.ts` — `computeEdgeVisibleScore`, `applyGraphFilters` (filters only, no focus), `GraphStats` per `contracts/graph-selectors.md`

**Checkpoint**: Settings types, persistence parse/merge, filter pipeline, and pure view math exist — stories can wire UI

---

## Phase 3: User Story 1 — Shape the graph from a single settings panel (Priority: P1) 🎯 MVP

**Goal**: Right-side settings panel with Filters/Display/Stats, edge-kind filtering, display options, legend, zoom relocation, responsive layout

**Independent Test**: Open panel → disable `view` kind → raise min edge points → verify edges/stats/legend update; all kinds off → notice; defaults unchanged graph (SC-007)

### Implementation for User Story 1

- [x] T008 [P] [US1] Add data-driven edge breakdown kind metadata (keys, labels, colors) to `frontend/src/registry/odooProfile.ts` for panel Filters
- [x] T009 [US1] Extend `frontend/src/components/graphSelectors.ts` with `computeNodeDisplay`, `computeEdgeDisplay`, and full stats in `applyGraphFilters`
- [x] T010 [P] [US1] Create `frontend/src/components/GraphSettingsPanel.tsx` — Accordion shell (Filters/Display/Forces/Focus/Stats), collapse toggle, header reset (FR-001–003b); **empty Forces/Focus sections** (labels only, no controls until US2/US3); **time-lapse placeholder** below zoom (commit position + disabled controls per FR-001 US1 note)
- [x] T011 [P] [US1] Implement Filters + Display sections in `frontend/src/components/GraphSettingsPanel.tsx` (kinds, min score, include zero-score, arrows, labels, size/thickness metrics, badges)
- [x] T012 [P] [US1] Create `frontend/src/components/GraphLegend.tsx` and Stats section in `frontend/src/components/GraphSettingsPanel.tsx` — counters (FR-017) plus legend below them in-panel, not on canvas (FR-018)
- [x] T013 [US1] Refactor `frontend/src/components/ModuleGraph.tsx` to accept filtered nodes/edges + `GraphDisplayState`; wire display models from selectors; import `graphViewPure.ts` (**depends on T006**)
- [x] T014 [US1] Move zoom in/out/fit from `ModuleGraph.tsx` into `GraphSettingsPanel.tsx` via zoom commands (FR-004; transient, not persisted)
- [x] T015 [US1] Create `frontend/src/transforms/snapshotTransforms.ts` (`graphEdgesToRows`, `visibleLinesTotal`, `moduleOptionsFromModules`, etc.) with remeda
- [x] T016 [US1] Refactor `frontend/src/pages/SnapshotPage.tsx` — flex layout, panel integration, remove header zero-score checkbox, `useMemo` → transforms + `applyGraphFilters`, Drawer below 900px (FR-005)

**Checkpoint**: US1 fully testable via quickstart Scenario 1

---

## Phase 4: User Story 2 — Focus mode + hover highlight (Priority: P2)

**Goal**: Local subgraph by depth/direction; hover emphasis with fade; focus persistence across commits

**Independent Test**: Select module → focus depth 1 → only neighbors; hover fade; commit switch with/without subject (US2 #7, FR-021a)

### Implementation for User Story 2

- [x] T017 [US2] Add `computeLocalGraph` to `frontend/src/components/graphSelectors.ts` (BFS, direction, filters-first per FR-020)
- [x] T018 [US2] Integrate focus into `applyGraphFilters` pipeline in `frontend/src/components/graphSelectors.ts`
- [x] T019 [P] [US2] Add Focus section + "fade non-neighbors" toggle in Display to `frontend/src/components/GraphSettingsPanel.tsx`
- [x] T020 [US2] Wire focus subject on node click without auto-enabling focus in `frontend/src/pages/SnapshotPage.tsx` and `frontend/src/components/ModuleGraph.tsx` (FR-021)
- [x] T021 [US2] Implement hover highlight/fade in `frontend/src/components/ModuleGraph.tsx` (opacity 1.0 vs ≤0.2, ~150ms, FR-022)
- [x] T022 [US2] Implement FR-021a focus auto-clear on commit change and FR-037 empty-state notices in graph area via `SnapshotPage.tsx` / `ModuleGraph.tsx`

**Checkpoint**: US1 + US2 independently testable via quickstart Scenarios 1–2

---

## Phase 5: User Story 3 — Forces + layout persistence (Priority: P3)

**Goal**: Configurable d3 forces, pin/unpin, save/load/reset layout per project+commit

**Independent Test**: Move force slider → layout changes; pin → save → reload → load; unpin-all vs reset layout (US3 #5, FR-027)

### Implementation for User Story 3

- [x] T023 [US3] Wire `GraphForceState` into d3 simulation in `frontend/src/components/ModuleGraph.tsx` (replace hardcoded constants, FR-024)
- [x] T024 [P] [US3] Implement Forces section (sliders, restart layout, reset forces) in `frontend/src/components/GraphSettingsPanel.tsx`
- [x] T025 [P] [US3] Create `frontend/src/components/useGraphLayoutStore.ts` (localStorage shell using `graphPersistence.ts` layout functions)
- [x] T026 [US3] Implement pin/unpin (double-click + panel keyboard control) and pinned marker in `frontend/src/components/ModuleGraph.tsx` (FR-026)
- [x] T027 [US3] Add save/load/reset layout and unpin-all actions to `frontend/src/components/GraphSettingsPanel.tsx` (FR-027–029)

**Checkpoint**: US1–US3 testable via quickstart Scenarios 1–3

---

## Phase 6: User Story 4 — Commit time-lapse (Priority: P4)

**Goal**: Play/pause/step through commits with speed control; stop on last commit

**Independent Test**: Play through commits → pause → step; single-commit disabled state; focus persists (US4 #5–6, FR-031)

### Implementation for User Story 4

- [x] T028 [P] [US4] Replace time-lapse placeholder with live controls (play/pause/prev/next/speed, commit position display) in `frontend/src/components/GraphSettingsPanel.tsx` (FR-030)
- [x] T029 [US4] Wire timelapse interval and commit advance in `frontend/src/pages/SnapshotPage.tsx` (FR-030/031/031a; stop on last commit)

**Checkpoint**: All four user stories independently testable via quickstart

---

## Phase 7: FP Cross-Page Refactor (where appropriate)

**Purpose**: Full TS FP pass per `fp-refactor-plan.md` Phases 3–5 — extract page derivations into `transforms/*`

- [x] T030 [P] Create `frontend/src/transforms/commitOptions.ts` with `toCommitSelectOptions` (dedupe commit Select mapping)
- [x] T031 [P] Create `frontend/src/transforms/structureTransforms.ts` and refactor `frontend/src/pages/StructurePage.tsx` to thin shell
- [x] T032 [P] Create `frontend/src/transforms/reportTransforms.ts` and refactor pure logic out of `frontend/src/components/ReportTables.tsx`
- [x] T033 [P] Create `frontend/src/transforms/analyticsTransforms.ts` and refactor `frontend/src/pages/AnalyticsPage.tsx` derivations
- [x] T034 [P] Create `frontend/src/transforms/treemapTransforms.ts` and refactor pure helpers out of `frontend/src/components/FileTreemap.tsx`
- [x] T034a [P] Refactor `frontend/src/pages/DashboardPage.tsx` — extract chart row shaping into transforms if loops remain (skip if already thin per fp-refactor-plan)

**Checkpoint**: No filter/sort/aggregate `for`/`reduce` left in `frontend/src/pages/` except documented async batch shell in ReportTables

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validation, accessibility, non-regression

- [x] T035 [P] Verify FR-034 keyboard/ARIA on `frontend/src/components/GraphSettingsPanel.tsx` controls
- [x] T036 Run `specs/003-graph-explorer-ui/quickstart.md` Scenarios 1–5 manually against fixture project; include FR-035 smoke on a dense graph (~500 nodes) if fixture allows
- [x] T037 Run `npm run build` in `frontend/` and confirm SC-007 default graph parity (Defaults table, no settings changed)

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) — BLOCKS all user stories
    ↓
Phase 3 (US1 P1) 🎯 MVP
    ↓
Phase 4 (US2) — depends on US1 panel + selectors
    ↓
Phase 5 (US3) — depends on US1 ModuleGraph refactor
    ↓
Phase 6 (US4) — depends on US1 SnapshotPage wiring
    ↓
Phase 7 (FP refactor) — can interleave after US1; complete before Phase 8
    ↓
Phase 8 (Polish)
```

### User Story Dependencies

| Story | Depends on | Independent test |
|-------|------------|-------------------|
| US1 (P1) | Phase 2 only | quickstart Scenario 1 |
| US2 (P2) | US1 panel + base ModuleGraph | quickstart Scenario 2 |
| US3 (P3) | US1 ModuleGraph shell | quickstart Scenario 3 |
| US4 (P4) | US1 SnapshotPage | quickstart Scenario 4 |

### Parallel Opportunities

**After Phase 2 completes:**

```text
US1 parallel batch:
  T008 [P] odooProfile edge-kind metadata
  T010 [P] GraphSettingsPanel shell (Forces/Focus empty + timelapse placeholder)
  T011 [P] Filters + Display sections
  T012 [P] GraphLegend + Stats section
  T012 waits for T009 selectors display fns

US2 parallel batch (after US1):
  T019 [P] Focus section in panel
  T021 can parallel T020 if different files — T020 ModuleGraph, T019 panel

US3 parallel batch (after US1):
  T024 [P] Forces section
  T025 [P] useGraphLayoutStore

Phase 7 — all six transform/page tasks [P] in parallel where noted (T030–T034, T034a)
```

---

## Parallel Example: User Story 1

```bash
# After T007 (graphSelectors filter core):
# Parallel:
T008  frontend/src/registry/odooProfile.ts
T010  frontend/src/components/GraphSettingsPanel.tsx (shell + placeholders)
T012  frontend/src/components/GraphLegend.tsx
T015  frontend/src/transforms/snapshotTransforms.ts

# Then sequential:
T009  graphSelectors display fns
T013  ModuleGraph props refactor
T016  SnapshotPage integration
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 → Phase 2 (foundational)
2. Phase 3 (US1) — stop at checkpoint
3. Validate quickstart Scenario 1 + SC-007 defaults
4. Demo/deploy

### Incremental Delivery

1. Setup + Foundational
2. **US1** → MVP demo
3. **US2** → focus + hover
4. **US3** → forces + layout persistence
5. **US4** → time-lapse
6. **Phase 7** → FP cross-page refactor
7. **Phase 8** → polish

### Suggested MVP Scope

**Phases 1–3 only (T001–T016)** — delivers the Obsidian-style panel, filters, display, stats/legend, zoom relocation, and responsive layout. This matches spec P1 and source doc Iteration 1.

---

## Notes

- All new pure modules MUST use remeda (`pipe`, `map`, `filter`, `sumBy`, `clamp`, `mergeDeep`) — see `fp-refactor-plan.md`
- Do not FP-refactor d3 tick loops or DOM ref writes in `ModuleGraph.tsx`
- No backend changes (FR-033)
- `Forces` and `Focus` section **shells** (accordion items, no controls) ship in US1 T010; full behavior lands in US2/US3 (T019/T024)
- Time-lapse **placeholder** (disabled controls + commit position) ships in US1 T010; T028 replaces with live wiring
- Commit after each phase checkpoint
