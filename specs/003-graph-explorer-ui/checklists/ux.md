# UX Requirements Quality Checklist: Graph Explorer UI — Right-Side Settings Panel

**Purpose**: Validate the quality of UX/interaction requirements writing — completeness, clarity, measurability, consistency, and scenario/edge-case coverage — before implementation begins. This is NOT a behavioral test; every item asks whether a requirement is well-written and objectively actionable.
**Created**: 2026-06-21
**Feature**: [spec.md](../spec.md)
**Depth**: Standard | **Audience**: Reviewer (PR) | **Focus clusters**: UX/interaction requirements quality; requirements completeness and edge-case/scenario coverage

**Resolution status (2026-06-21)**: All 43 items addressed via spec updates (FR-001..FR-037, expanded Edge Cases, new Non-Functional Requirements, Defaults table, quantified Success Criteria, expanded Assumptions) and contract fixes (persistence.md, graph-settings-state.md, component-contracts.md).

---

## Requirement Completeness

- [x] CHK001 Is the layout/section structure that constitutes "visually modeled on the Obsidian Graph View panel" (FR-001) defined with measurable criteria — section count, section order, panel width, header labels — or left to visual interpretation of the reference screenshot? [Clarity, Spec §FR-001]
  - Resolved: FR-001 now fixes exactly five sections, their order, the 320 px (±20) width, and header controls.
- [x] CHK002 Does the spec define the default expanded/collapsed state for each of the five panel sections, and whether the expanded/collapsed state persists across reloads alongside the settings values (FR-003a)? [Gap, Spec §FR-001, Spec §FR-003a]
  - Resolved: FR-001a (all sections expanded by default, expanded-state persisted); FR-003a includes per-section expanded state.
- [x] CHK003 Are the "minimum edge points" slider bounds (FR-009) fully defined — static constant vs. derived from max observed score, and behavior when all scores are 0? [Clarity, Spec §FR-009]
  - Resolved: FR-009 — range `0..maxEffectiveScore` (dynamic), step 1, disabled at 0 when max is 0.
- [x] CHK004 Does the spec define what a "compact toggle" (FR-002) consists of, and whether the last known panel width is preserved when re-expanding? [Clarity, Spec §FR-002]
  - Resolved: FR-002 — gear ActionIcon, ≥32×32 px, tooltip; fixed width so no width memory needed.
- [x] CHK005 Is "reset to defaults" (FR-003a) specified to reset all three state groups simultaneously or independently, and is its UI placement defined? [Completeness, Spec §FR-003a]
  - Resolved: FR-003b — single header "Reset to defaults" resets all groups + section state; force-only reset stays in Forces (FR-025).
- [x] CHK006 Is the "label fade threshold" (FR-013) quantified, and what "fade" means? [Clarity, Spec §FR-013]
  - Resolved: FR-013 — minimum zoom scale 0.0–2.0, step 0.1, default 0.0; instant hide below threshold (not gradient).
- [x] CHK007 Are node-size/link-thickness scales (FR-014/015) defined with min/max/step/unit? [Clarity, Spec §FR-014, §FR-015]
  - Resolved: both are unitless multipliers, range 0.5–2.0, step 0.1, default 1.0.
- [x] CHK008 Does the spec define the "warning indicator" on a node badge (FR-016)? [Clarity, Spec §FR-016]
  - Resolved: FR-016 — reserved for a per-node parse-error count; not shown this version (field absent in `GraphNode`), auto-activates if added later.
- [x] CHK009 Are all "sensible defaults" (FR-032) enumerated in the spec itself? [Measurability, Spec §FR-032]
  - Resolved: new authoritative **Defaults** table in Requirements.
- [x] CHK010 Does the relocated "include zero-score edges" toggle (FR-009) retain identical semantics so SC-007 is testable? [Completeness, Spec §FR-009, §SC-007]
  - Resolved: FR-009 states identical semantics to the current control.
- [x] CHK011 Does the Stats section (FR-017) reflect filtered+focused view, global, or both? [Gap, Spec §FR-017]
  - Resolved: FR-017 — visible = filtered+focused view; totals = full graph; both shown.

---

## Requirement Clarity

- [x] CHK012 Is "immediately" (FR-003) quantified? [Measurability, Spec §FR-003]
  - Resolved: FR-003 — same-frame application, no reload/network; force changes may animate after.
- [x] CHK013 Is "the graph stays large" (FR-005) defined with a minimum canvas area? [Clarity, Spec §FR-005]
  - Resolved: FR-005 — canvas keeps ≥60% container width when panel expanded.
- [x] CHK014 Are the responsive breakpoints for the drawer (FR-005) specified? [Gap, Spec §FR-005]
  - Resolved: FR-005 — container width < 900 px switches the panel to a Drawer.
- [x] CHK015 Is focus "depth" (FR-019) defined and consistent with direction (FR-020)? [Clarity, Spec §FR-019, §FR-020]
  - Resolved: FR-019/020 — depth = hop count over the filtered set; direction governs traversal; fixed execution order.
- [x] CHK016 Is double-click (FR-026) the sole pin interaction, with a touch/accessibility alternative? [Completeness, Spec §FR-026]
  - Resolved: FR-026 — adds a keyboard-activatable pin/unpin control for the selected module.
- [x] CHK017 Is "visually distinguishable" (SC-004) quantified? [Measurability, Spec §SC-004]
  - Resolved: SC-004/FR-022 — neighbors at 1.0 vs non-neighbors ≤ 0.2 opacity.
- [x] CHK018 Is "under 30 seconds" (SC-002) interaction-time only? [Measurability, Spec §SC-002]
  - Resolved: SC-002 — user interaction time, excluding render/animation.
- [x] CHK019 Is "three interactions" (SC-003) defined as to what counts? [Measurability, Spec §SC-003]
  - Resolved: SC-003 — counted from panel already open: click, focus toggle, set depth/direction.

---

## Requirement Consistency

- [x] CHK020 Is the filter-before-focus order unambiguous across FR-020 and Clarifications? [Consistency, Spec §FR-020, Clarifications]
  - Resolved: FR-020 spells out the two-step execution order explicitly.
- [x] CHK021 Does FR-006 conflict (data-driven vs. fixed enum)? [Conflict, Spec §FR-006, Assumptions]
  - Resolved: FR-006 — list is data-driven; the four kinds are the current profile's set; Assumptions reinforce.
- [x] CHK022 Are FR-021 and the `focusModule` contract consistent on auto-enabling focus? [Consistency, Spec §FR-021, contracts/graph-settings-state.md]
  - Resolved: FR-021 + state contract — click sets subject only, never auto-enables focus.
- [x] CHK023 Does FR-027 "reset layout" clear the persisted key or only memory? [Consistency, Spec §FR-027, persistence.md]
  - Resolved: FR-027 — reset is permanent (deletes saved key); unpin-all is transient; persistence.md aligned.
- [x] CHK024 Is FR-004 (zoom) consistent with FR-003 (persist/restore)? [Consistency, Spec §FR-003, §FR-004]
  - Resolved: FR-003a/004 — zoom/pan are transient, explicitly not persisted.

---

## Acceptance Criteria Quality

- [x] CHK025 Are hover-highlight scenarios (FR-022) specific on emphasis/fade/timing? [Measurability, Spec US2 #5]
  - Resolved: FR-022 + US2 #5 — opacity 1.0 vs ≤0.2, ~150 ms transition, clear on leave.
- [x] CHK026 Does SC-005 cover the partial-match case (FR-029)? [Measurability, Spec §SC-005, §FR-029]
  - Resolved: SC-005 — passes with exact restore of saved nodes + auto-place of new ones.
- [x] CHK027 Does SC-007 identify a reproducible baseline? [Measurability, Spec §SC-007]
  - Resolved: SC-007 — baseline = same commit rendered by pre-feature `ModuleGraph` with prior constants.
- [x] CHK028 Is US3 #4 "recover" defined with a position tolerance? [Measurability, Spec US3 #4]
  - Resolved: US3 #4 / FR-029 — restore to saved integer-pixel coordinates.
- [x] CHK029 Does SC-006 define minimum commits and the "which commit" display? [Measurability, Spec §SC-006, §FR-031]
  - Resolved: SC-006/FR-031 — ≥2 commits; order + short hash + sequence position shown.

---

## Scenario Coverage

- [x] CHK030 Is there a scenario for a commit switch while focus is active? [Gap, Spec Edge Cases, US2]
  - Resolved: US2 #7 + Edge Cases.
- [x] CHK031 Is there a scenario for the focused module absent after a commit change? [Gap, Spec §FR-020, Edge Cases]
  - Resolved: FR-021a + Edge Cases (auto-clear with notice).
- [x] CHK032 Is there a time-lapse + focus scenario? [Gap, Spec US4, §FR-020]
  - Resolved: FR-031a + US4 #5.
- [x] CHK033 Is there an "unpin all" scenario distinguishing saved vs in-memory? [Gap, Spec §FR-027]
  - Resolved: FR-027 + US3 #5 (unpin-all transient; reset permanent).
- [x] CHK034 Is there a Stats scenario when all kinds disabled? [Gap, Spec §FR-011, §FR-017]
  - Resolved: FR-011 (notice replaces canvas, stats = 0) + FR-037 precedence.

---

## Edge Case Coverage

- [x] CHK035 Is the "threshold exceeds strongest edge" case distinct from "all kinds disabled"? [Edge Case, Spec Edge Cases, §FR-011]
  - Resolved: FR-037 + Edge Cases — distinct "all edges below threshold" notice, nodes still visible.
- [x] CHK036 Is the `<projectOrRepo>` key specified for all failure modes / origin collisions? [Gap, persistence.md, Assumptions]
  - Resolved: persistence.md — project_id → repo_path → origin+pathname; disabled with notice if none; Edge Cases note collision avoidance.
- [x] CHK037 Is time-lapse with exactly one commit specified? [Edge Case, Spec §FR-031]
  - Resolved: FR-030 + US4 #6 + Edge Cases (controls disabled with hint).
- [x] CHK038 Is precedence defined when "no kinds" and "no neighbors" both apply? [Edge Case, Spec §FR-011, Edge Cases]
  - Resolved: FR-037 precedence ladder.
- [x] CHK039 Is layout restore under schema version mismatch defined? [Gap, persistence.md]
  - Resolved: FR-029/FR-036 + persistence.md — treat as absent, no migration.

---

## Non-Functional Requirements

- [x] CHK040 Are accessibility requirements defined for the panel (keyboard, ARIA, contrast)? [Gap, Non-Functional]
  - Resolved: FR-034 (keyboard nav, ARIA names, keyboard-activatable pin, opacity-not-color emphasis).
- [x] CHK041 Is the max graph scale for "feel instant" defined in the spec, not only the plan? [Measurability, Plan Technical Context]
  - Resolved: FR-035 — ~500 nodes / ~2,000 edges supported interactive scale; graceful degradation beyond.

---

## Dependencies & Assumptions

- [x] CHK042 Does the spec define the stable inherited inputs from feature 002 for FR-033? [Assumption, Spec Assumptions, §FR-033]
  - Resolved: Assumptions "Inherited inputs" enumerates the guaranteed `GraphNode`/`GraphEdge`/`EdgeBreakdown` fields; FR-033 references it.
- [x] CHK043 Is the "kinds from loaded data" assumption tested by acceptance scenarios? [Assumption, Spec Assumptions, §FR-006]
  - Resolved: US1 #7 acceptance scenario (toggle rendered only for kinds present in data) + Assumptions.

---

## Notes

- Check items off as completed: `[x]`
- Add findings or references inline beneath each item
- Items without `[x]` at implementation start indicate specification gaps that should be resolved or consciously accepted as acceptable ambiguity before coding begins
- Traceability markers: `[Spec §FR-xxx]` = functional requirement, `[Spec §SC-xxx]` = success criterion, `[Spec US#]` = user story scenario, `[Plan ...]` = plan artifact, `[Gap]` = missing requirement, `[Conflict]` = contradictory requirements, `[Ambiguity]` = unclear intent, `[Assumption]` = unverified assumption
