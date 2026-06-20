# Requirements Quality Checklist: Restore Lost UI & Metrics Parity, Rename to `ppi`, In-Project `.ppi` Store

**Purpose**: Validate the quality, clarity, completeness, consistency, and measurability of the WRITTEN requirements (unit tests for the spec, not the implementation).
**Created**: 2026-06-20
**Feature**: [spec.md](../spec.md)

**Assumed defaults** (non-interactive run): Depth = Standard; Audience = Reviewer (PR); Focus clusters = (a) recovered metrics/data completeness & clarity, (b) restored interactive UI parity & generic registry-driven UI, (c) project rename to `ppi`, (d) in-project `.ppi/` store behavior, (e) CLI+API parity & edge-inclusion consistency.

## Recovered Metrics & Data — Completeness

- [x] CHK001 Are the evidence record fields fully enumerated and bounded (kind, file path, line, detail) with source quotes explicitly excluded? [Completeness, Spec §FR-001/§FR-002]
- [x] CHK002 Is the graph-point breakdown's relation-kind → category mapping (model_reuse / extension_or_method / view / field_property) defined or referenced within the requirements rather than assumed? [Completeness, Spec §FR-003]
- [x] CHK003 Are the concrete per-module lists required by the spec (declared models, inherited models, in-scope manifest depends) specified as name lists, not only counts? [Completeness, Spec §FR-006]
- [x] CHK004 Is the rule for retaining non-scoring relation kinds defined by an objective criterion ("outside the scoring groups") rather than an open-ended example set? [Completeness, Spec §FR-007]
- [x] CHK005 Are the three distinct relation-count meanings (distinct module-pair edges, per-kind occurrences, evidence counts) each defined and distinguishable? [Completeness, Spec §FR-008]

## Recovered Metrics & Data — Clarity & Measurability

- [x] CHK006 Is "production Python files excluding tests and `__manifest__.py`" precise about what qualifies as a "test" file (location/naming criterion)? [Clarity, Spec §FR-004]
- [x] CHK007 Is `top_folder` defined for files located at the module root (no first-level subfolder)? [Edge Case, Spec §FR-005]
- [x] CHK008 Is "in-scope" defined consistently for both manifest dependencies and model lists relative to the selected module scope? [Consistency, Spec §FR-006/§FR-040]
- [x] CHK009 Can `python_file_count` be objectively measured against the stated definition for a given module? [Measurability, Spec §FR-004]

## Restored Interactive UI — Completeness & Consistency

- [x] CHK010 Is the set of restored UI surfaces consistent between the functional requirements and Success Criteria (graph, toolbars, detail panels, treemap, tables, edge-points, manifest view, parse/failure view)? [Consistency, Spec §FR-013–§FR-025 / §SC-003]
- [x] CHK011 Are the line categories enumerated identically across the toolbar, tables, and treemap requirements? [Consistency, Spec §FR-014/§FR-019/§FR-020]
- [x] CHK012 Are empty/zero-state requirements defined for the treemap and for zero-score relation kinds? [Edge Case, Spec §FR-017 / Edge Cases]
- [x] CHK013 Is the generic registry-driven UI requirement stated with a verifiable criterion (no Odoo-hardwired UI; data flows via active profile/registry)? [Clarity, Spec §FR-025]

## Restored Interactive UI — Clarity & Measurability

- [x] CHK014 Is "edge thickness reflecting relation strength" tied to a specific, measurable metric (e.g., edge total points)? [Measurability, Spec §FR-013]
- [x] CHK015 Are the brightness toolbar's "weighted criteria" defined as to how multiple toggled criteria combine into node color (weights, normalization, scale)? [Clarity, Spec §FR-015]
- [x] CHK016 Is the required content of the edge-points "why points" explanation specified? [Clarity, Spec §FR-021]
- [x] CHK017 Is "method count" unambiguously defined (functions/methods from cyclomatic analysis, not the Odoo class-analyzer count) wherever it is used? [Consistency, Spec §FR-016/§FR-015]
- [x] CHK018 Are commit-selector-driven update requirements defined consistently for every restored snapshot surface? [Consistency, Spec §FR-023/§SC-003]

## Rename to `ppi`

- [x] CHK019 Is the rename scope fully enumerated (import package, console command, PyPI distribution, `.ppi/` directory) alongside the explicitly preserved items (README product name, git repo name)? [Completeness, Spec §FR-031–§FR-033]
- [x] CHK020 Is "no reachable `python_project_inspector` import path remains" stated as an objectively verifiable requirement? [Measurability, Spec §FR-034]
- [x] CHK021 Is "all existing behavior unchanged except for the name" bounded enough to be checkable (e.g., via the existing behavior/test baseline)? [Clarity, Spec §FR-034]

## In-Project `.ppi` Store

- [x] CHK022 Are the artifacts that stay outside the repo vs. those allowed inside `.ppi/` fully enumerated? [Completeness, Spec §FR-035/§FR-037]
- [x] CHK023 Is the `.ppi/.gitignore` behavior defined for the case where the file already exists (preserve self-ignore, no blind overwrite)? [Edge Case, Spec §FR-036 / Edge Cases]
- [x] CHK024 Is the already-tracked-`.ppi` situation specified to warn rather than corrupt Git state? [Edge Case, Spec §FR-037 / Edge Cases]
- [x] CHK025 Is store resolution defined as deterministic, with the no-migration/supersede behavior of the prior user-level store stated? [Clarity, Spec §FR-037 / US6 Scenario 4]
- [x] CHK026 Is the fail-fast behavior for an uncreatable/unwritable `.ppi/` defined with a triggering condition? [Edge Case, Spec §FR-038]

## CLI + API Parity & Edge-Inclusion Consistency

- [x] CHK027 Is the "available via BOTH the CLI and the HTTP API" requirement applied consistently to every enumerated new read, snapshot, evidence, breakdown, and series? [Consistency, Spec §FR-039]
- [x] CHK028 Is the default edge-inclusion rule (the threshold separating scored from zero-score edges) defined explicitly in the requirements? [Clarity, Spec §FR-027]
- [x] CHK029 Is the edge-inclusion rule required to be identical across the structure chart, the edge table, and the API edge reads for a given toggle state? [Consistency, Spec §FR-027/§FR-039]
- [x] CHK030 Is the aggregation set (mean/median/p95/max) enumerated and the hotspot↔chart match stated as objectively verifiable? [Measurability, Spec §FR-026]

## Scenario, Edge-Case & Cross-Cutting Coverage

- [x] CHK031 Are exception-flow requirements defined for snapshot/detail/edge reads given an unknown commit, module, file, or source/target selector? [Coverage, Gap]
- [x] CHK032 Is the "large evidence volume" expectation either quantified or explicitly aligned with the deferred-performance decision rather than relying on the unmeasurable term "reasonable limits"? [Measurability, Spec Edge Cases / Assumptions]
- [x] CHK033 Is the SC-009 parity completion set self-contained (reproduced/traceable) rather than depending solely on an external gap-report checklist? [Traceability, Spec §SC-009]
- [x] CHK034 Is the deferred scope (source quotes, §26 graph enhancements, `total_file_count`, performance targets) stated unambiguously enough to bound this feature? [Clarity, Spec Assumptions / Open Questions]
- [x] CHK035 Is a requirement-to-outcome traceability path established (FR ↔ SC ↔ User Story) so each requirement maps to a measurable outcome? [Traceability]

## Notes

- Check items off as completed: `[x]`
- Each item tests the WRITTEN requirement quality, not implementation behavior.
- Traceability markers: `[Spec §X]` references existing text; `[Gap]` flags missing requirements.
