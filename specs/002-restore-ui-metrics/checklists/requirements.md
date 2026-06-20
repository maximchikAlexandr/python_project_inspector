# Specification Quality Checklist: Restore Lost UI & Metrics Parity, Rename to `ppi`, In-Project `.ppi` Store

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-20
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- The three blocking contradictions (E1, E2, E3) were escalated to the owner and resolved
  on 2026-06-20: E1 → DuckDB store only inside `.ppi/` (other artifacts stay outside the
  repo) with a self-ignoring `.ppi/.gitignore` (`*`); E2 → generalize restored surfaces into
  the generic registry-driven UI now; E3 → keep deferring `pluggy` and extend the built-in
  analyzer. No `[NEEDS CLARIFICATION]` markers remain.
- Some success criteria and requirements name concrete report surfaces (graph, treemap,
  tables, evidence). These are product capabilities being restored to parity with the old
  tool, not implementation choices; per E2 they are delivered through the generic
  registry-driven UI parameterized by the active profile.
