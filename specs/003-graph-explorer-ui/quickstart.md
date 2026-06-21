# Quickstart: Validating the Graph Explorer UI

Manual validation guide for the MVP (no automated frontend tests in this feature). Each scenario maps to user stories and functional requirements in `spec.md`.

## Prerequisites

- A project already analyzed into its `.ppi/history.duckdb` store with multiple commits.
- Node toolchain installed for the frontend.

## Setup

```bash
# Backend report server (read-only), from repo root:
ppi serve --project <path-to-analyzed-repo>

# Frontend dev server, in a second terminal:
cd frontend
npm install
npm run dev
```

Open the report, go to the **Report snapshot** page, and pick a commit with a dense graph.

## Scenario 1 — Shape the graph from the panel (US1 / FR-001..018)

1. Open the settings panel (toggle top-right of the graph). Confirm sections **Filters, Display, Forces, Focus, Stats**, plus zoom buttons. (FR-001/004)
2. In **Filters**, turn off `view`. Expected: edges whose weight came only from `view` disappear; the **Stats** "visible edges" count drops; thickness of remaining edges reflects the recomputed score. (FR-006/007/010, AC US1#2)
3. Raise **Minimum edge points**. Expected: weak edges vanish progressively. (FR-008, AC US1#3)
4. Turn off **all** edge kinds. Expected: a "no relationship kinds selected" notice instead of a blank canvas. (FR-011, AC US1#4)
5. Re-enable kinds. In **Display**, toggle arrows off, switch label mode to `none`, set node-size metric to `fixed`, then to `method_count`; toggle edge labels and node badges. Expected: the graph updates immediately for each. (FR-012..016, AC US1#5)
6. Read **Stats** + legend: total vs visible nodes/edges, hidden-by-filters, selected module, focus state; legend explains size/color/thickness/kind. (FR-017/018, AC US1#6)

## Scenario 2 — Focus mode + hover (US2 / FR-019..023)

1. Click a module node → it becomes selected/focus subject. (FR-021)
2. In **Focus**, enable "focus selected module" at depth 1. Expected: only the module + direct neighbors remain. (FR-019/020, AC US2#1)
3. Increase depth to 2–3. Expected: subgraph grows by hops. (AC US2#2)
4. Set direction to `incoming`, then `outgoing`. Expected: only that direction is followed. (AC US2#3)
5. Confirm a previously filtered-out edge does **not** pull in a neighbor (filters apply before focus). (FR-020, Clarification)
6. "Clear focus" → full graph returns. (AC US2#4)
7. In **Display**, enable "fade non-neighbors on hover". Hover a node → it + neighbors + their edges emphasized, rest faded; hover an edge → edge + endpoints emphasized. Disable it → hovering no longer fades. (FR-022/023, AC US2#5/6)

## Scenario 3 — Forces + layout persistence (US3 / FR-024..029)

1. In **Forces**, move repel/link/center sliders. Expected: layout visibly rearranges. (FR-024, AC US3#1)
2. "Restart layout" re-runs the sim; "Reset forces" returns sliders to defaults. (FR-025, AC US3#2)
3. Double-click a node → it pins (marker shown) and stays put across a restart; double-click again unpins. (FR-026, AC US3#3)
4. Arrange + pin a few nodes, click **Save layout**. Reload the page (or switch commit and back), then **Load saved layout**. Expected: saved positions and pins restored; new/removed nodes handled gracefully. (FR-028/029, AC US3#4)
5. **Reset layout** / **Unpin all** clear positions/pins. (FR-027, AC US3#5)

## Scenario 4 — Commit time-lapse (US4 / FR-030/031)

1. Press **Play**. Expected: the report steps through commits in order, graph redraws each. (AC US4#1)
2. **Pause**, then step **previous/next** one commit at a time. (AC US4#2)
3. Change **speed**. Expected: interval changes. (AC US4#3)
4. Let it reach the last commit. Expected: it **stops** (does not loop); current commit + position shown throughout. (FR-031, Clarification, AC US4#4)

## Scenario 5 — Persistence & non-regression (FR-003a/032)

1. Change several settings, reload the page. Expected: panel settings auto-restore. (FR-003a)
2. Clear settings (Reset all) or use a fresh browser profile. Expected: the default graph looks/behaves like the pre-feature graph. (FR-032, SC-007)
3. Narrow the window. Expected: the panel becomes a drawer; the graph stays usable. (FR-005)

## Pass criteria

All scenarios behave as described, the graph stays interactive at the fixture's scale, and no backend/API change was required (FR-033, SC-008).
