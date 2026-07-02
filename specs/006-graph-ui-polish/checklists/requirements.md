# Requirements Quality Checklist: Graph UI Polish and Tables Reorganization

**Feature**: `006-graph-ui-polish`  
**Checked**: 2026-07-02

## Content Quality

- [x] No implementation-specific technology choices are required by the spec.
- [x] Feature overview is concise and user-centered.
- [x] User scenarios are testable from the UI perspective.
- [x] Functional requirements use stable IDs.
- [x] Requirements are phrased as observable behavior.
- [x] Edge cases are listed for risky UI states.
- [x] Success criteria are measurable.
- [x] Assumptions are explicit.
- [x] Key entities are defined.
- [x] Out-of-scope items are listed.

## Requirement Completeness

- [x] Sidebar Statistics removal is covered.
- [x] Timelapse final-position behavior is covered.
- [x] Human-readable edge labels are covered.
- [x] Edge-type labels are backend/config-driven with a readable fallback.
- [x] Edge-type label fallback behavior is clarified and avoids raw snake_case in normal UI.
- [x] Graph viewport recovery and bounded pan are covered.
- [x] Graph viewport recovery timing is clarified.
- [x] Graph pan boundary padding behavior is clarified.
- [x] Moving line-category and brightness controls to sidebar is covered.
- [x] Required sidebar ordering is covered.
- [x] Removal of old below-graph settings blocks is covered.
- [x] Tables top-level tab is covered.
- [x] Report tab table shortcuts are intentionally absent after tables move to the top-level Tables tab.
- [x] Tables tab snapshot/commit state sharing is clarified.
- [x] Tables tab behavior on shared snapshot/commit changes is clarified.
- [x] Dynamic line-count columns are covered.
- [x] Aggregation recalculation visibility is covered.
- [x] File-level target reset is covered.
- [x] Metrics Dashboard invalid level/target/metric combinations are prevented before query execution.
- [x] Commit date display is covered.
- [x] Commit date timezone behavior is clarified as user/browser local timezone.
- [x] Commit date display fixed format is clarified as `YYYY-MM-DD HH:mm`.

## Ambiguity Review

- [x] No unresolved `[NEEDS CLARIFICATION]` markers remain.
- [x] Scope-significant UX decisions from the source notes are resolved.
- [x] Requirements avoid dictating implementation files or frameworks.
- [x] Requirements distinguish UI placement from data collection changes.

## Readiness

- [x] Ready for planning.
- [x] Ready to derive acceptance tests.
- [x] Ready to estimate implementation work.
