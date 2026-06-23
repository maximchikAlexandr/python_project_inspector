# Thin-Client & Contract Parity Checklist: VS Code Extension — Thin Bridge

**Purpose**: Validate the *quality of the requirements* governing the thin-client invariant and contract parity for the VS Code extension bridge. This is a requirements-quality gate ("unit tests for English"), not an implementation test.
**Created**: 2026-06-22
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [contracts/](../contracts)

**Focus**: Thin-client invariants (extension must not own analysis/storage) + contract parity (browser ↔ Webview, `ppi serve` ↔ `ppi rpc`, `analyze --json` stream).
**Depth**: Standard review-gate.
**Audience/timing**: PR reviewer.

## Requirement Completeness

- [ ] CHK001 - Are requirements explicit that the extension must not open, read, or write the DuckDB store directly? [Completeness, Spec §FR-015]
- [ ] CHK002 - Is it required that every read path from the Webview routes through the CLI (not a private data access layer)? [Completeness, Spec §FR-015, §FR-016]
- [ ] CHK003 - Is it required that every write path (analysis run) routes through the existing CLI writer/lock, with no extension-side write? [Completeness, Spec §FR-015, Principle V]
- [ ] CHK004 - Are requirements present defining that `ppi rpc` is strictly read-only and rejects any write-attempting method? [Gap, Spec §FR-018]
- [ ] CHK005 - Is a parity requirement stated such that an interaction available in the browser dashboard is also available in the Webview? [Completeness, Spec §SC-002, §SC-003]
- [ ] CHK006 - Is a parity requirement stated between the HTTP query surface (`ppi serve`) and the stdio query surface (`ppi rpc`)? [Gap, Spec §FR-008, §SC-003]
- [ ] CHK007 - Are requirements present that the shared query dispatcher must not introduce behavior divergence between server and CLI modes? [Gap, Plan §Constitution Check]
- [ ] CHK008 - Is the closed set of query methods the Webview may invoke enumerated or referenced? [Completeness, contracts/cli-query-surface.md]
- [ ] CHK009 - Are requirements present that the `analyze --json` stream must not alter analysis logic, ordering, or the writer path? [Completeness, Spec §FR-019]
- [ ] CHK010 - Is a requirement present that the extension owns lifecycle (spawn/terminate) of the CLI processes it starts, including teardown on panel close? [Gap, Spec §FR-020]

## Requirement Clarity

- [ ] CHK011 - Is "thin client" defined with a concrete, testable boundary (what the extension must NOT touch), not left as a qualitative adjective? [Clarity, Spec §FR-015]
- [ ] CHK012 - Is "reuse the existing frontend" defined to mean the same bundle/components (not a reimplementation), with the only allowed change being the data-source adapter? [Clarity, Spec §FR-007, §FR-018]
- [ ] CHK013 - Is "live progress" quantified — e.g. event visibility ≤ 2 s after emission — rather than implied by "live"? [Clarity, Spec §SC-005, §FR-002]
- [ ] CHK014 - Is "same reports / no capability missing" (parity) defined with a measurable scope (e.g. the named dashboard capabilities: reports, graph explorer, commit navigation)? [Clarity, Spec §SC-002, §SC-003]
- [ ] CHK015 - Is the `cancelled` run status defined distinctly from `failed` (no result rollback) so the two are not conflatable? [Clarity, Spec §FR-020]
- [ ] CHK016 - Are the `analyze --json` terminal-event semantics defined (exactly one terminal event; process exit without one = unknown failure)? [Clarity, contracts/analyze-json-progress.md]
- [ ] CHK017 - Is "no server is started for the panel" stated unambiguously, excluding even a transient local HTTP server? [Clarity, Spec §FR-018, Clarifications Q1]

## Requirement Consistency

- [ ] CHK018 - Do the transport decision (no server, postMessage) and the data-source requirement (results delivered via message bridge) align without contradiction? [Consistency, Spec §FR-008, §FR-018]
- [ ] CHK019 - Is the spec's assumption naming `ppi query --format json` consistent with the plan's refinement to a persistent `ppi rpc` servant, or is the assumption now stale/contradictory? [Consistency, Spec §Assumptions vs Plan §R1]
- [ ] CHK020 - Does FR-006 (one run per workspace) align with FR-020 (cancel) so that "already running" offers cancel rather than silently blocking? [Consistency, Spec §FR-006, §FR-020]
- [ ] CHK021 - Are the `Analysis Run` status values in Key Entities consistent with the status values referenced in FR-020 and the progress contract? [Consistency, Spec §Key Entities, §FR-020]
- [ ] CHK022 - Is the parity claim (SC-003) consistent with the decision C transport (different data source) — i.e. is "same frontend bundle, differing only in data source" explicitly reconciled? [Consistency, Spec §SC-003, Clarifications Q1]

## Acceptance Criteria Quality

- [ ] CHK023 - Can the thin-client invariant (no direct DuckDB access) be objectively verified from the requirements without reading implementation? [Measurability, Spec §FR-015]
- [ ] CHK024 - Can parity (SC-003) be objectively verified — is a concrete comparison method (same request → same JSON) specified? [Measurability, Spec §SC-003, contracts/cli-query-surface.md]
- [ ] CHK025 - Are success criteria technology-agnostic (no framework/API leakage) while the feature is inherently IDE-specific? [Acceptance Criteria, Spec §SC-001..§SC-007]
- [ ] CHK026 - Is the "≤ 2 seconds" progress criterion tied to an observable event (emission in the `--json` stream) rather than an internal timestamp? [Measurability, Spec §SC-005]

## Scenario Coverage

- [ ] CHK027 - Are Alternate scenario requirements defined for multi-folder workspaces (selection + indication)? [Coverage, Spec §FR-017]
- [ ] CHK028 - Are Recovery scenario requirements defined for the orphaned-process case (reload mid-run) beyond best-effort reporting? [Coverage, Spec §Edge Cases, §Assumptions]
- [ ] CHK029 - Are Exception scenario requirements defined for CLI-not-found, schema-incompatible store, and missing store, each with a required user-facing resolution path? [Coverage, Spec §FR-004, §FR-014, §FR-010]
- [ ] CHK030 - Are Non-Functional scenario requirements defined for the persistent query process (cold-open once per session, no per-request startup)? [Coverage, Gap, Plan §R1]
- [ ] CHK031 - Are primary-flow requirements defined for the full analyze→open-dashboard→inspect loop end-to-end, not only per-story? [Coverage, Spec §SC-001, §SC-007]

## Edge Case Coverage

- [ ] CHK032 - Is the requirement defined for what happens when a second analysis is invoked while one is running (offer cancel, no second spawn)? [Edge Case, Spec §FR-006, §FR-020]
- [ ] CHK033 - Is the requirement defined for results from an older/incompatible analysis format (prompt re-run with rebuild)? [Edge Case, Spec §Edge Cases, contracts/query-rpc.md]
- [ ] CHK034 - Is the requirement defined for a profile not applicable to the workspace (e.g. `odoo` on a non-Odoo project)? [Edge Case, Spec §Edge Cases, §FR-011]
- [ ] CHK035 - Is the requirement defined for the dashboard panel opened with no results AND no run in progress (empty state + path to run)? [Edge Case, Spec §FR-010]
- [ ] CHK036 - Is the requirement defined for the `ppi rpc` servant dying or becoming unresponsive mid-session (restart/teardown behavior)? [Gap, Edge Case]

## Non-Functional Requirements

- [ ] CHK037 - Are requirements specified that the Python core must not gain VS Code/IDE/transport/HTTP imports (core independence)? [Non-Functional, Principle II, Plan §Constitution Check]
- [ ] CHK038 - Are requirements specified that new contracts (`analyze --json`, `ppi rpc`) use typed `msgspec` structs with explicit error codes? [Non-Functional, Principle VI, contracts/*]
- [ ] CHK039 - Is a requirement specified that the single-writer invariant is preserved (extension/`ppi rpc` never acquire the writer lock)? [Non-Functional, Principle V, Spec §FR-015]
- [ ] CHK040 - Is a requirement specified for acceptable dashboard responsiveness given the persistent-RPC transport (no per-request process spawn)? [Non-Functional, Gap, Plan §R1]

## Dependencies & Assumptions

- [ ] CHK041 - Is the dependency on the existing CLI (`analyze`, query surface, `RunMeta`, writer lock) documented as the integration contract? [Dependency, Spec §Assumptions]
- [ ] CHK042 - Is the assumption that `ppi rpc` is NOT the Stage 7 worker (read-only, no writes, extension-owned lifecycle) documented to prevent scope creep? [Assumption, Plan §R1]
- [ ] CHK043 - Is the dependency on the existing frontend's single `fetchJson` choke point documented as the parity integration seam? [Dependency, Spec §FR-018, Plan §R4]
- [ ] CHK044 - Is the assumption that `--jsonl` batch output remains orthogonal to `--json` progress documented? [Assumption, contracts/analyze-json-progress.md]

## Ambiguities & Conflicts

- [ ] CHK045 - Is the term "workspace" disambiguated between VS Code workspace (single/multi-folder) and the CLI's project/repo identity? [Ambiguity, Spec §FR-017, Plan §R6]
- [ ] CHK046 - Is the resolution path when the CLI is not installed specified concretely (configure interpreter vs install), or left ambiguous? [Ambiguity, Spec §FR-014, Plan §R5]
- [ ] CHK047 - Is the precedence between `ppi.pythonExecutable`, `ppi.cliPath`, and PATH-defined `ppi` explicitly ordered in requirements? [Ambiguity, contracts/extension-manifest.md]
- [ ] CHK048 - Is there a potential conflict between "no server" (decision C) and any remaining reference to `ppi serve` in spec assumptions that needs reconciliation? [Conflict, Spec §Assumptions vs Clarifications Q1]

## Notes

- This checklist tests whether the *requirements* are well-written; it does not test the implementation.
- Items marked `[Gap]` indicate a requirement that appears missing or only implied — resolve in the spec/plan before `/speckit-tasks`.
- Traceability: every item references a spec/plan/contract section or a quality marker.
- Check items off as completed: `[x]`.

## Audit Follow-up (2026-06-22)

Independent read-only audit follow-up. These items verify the requirements added to close the audit gaps (G1-G6); they still test requirement quality, not implementation.

- [ ] CHK049 - Is a requirement defined that after cancel the writer lock is recovered so the next run is not blocked? [Completeness, Recovery, Spec §FR-020]
- [ ] CHK050 - Is a requirement defined that the Webview bridge guarantees exactly one response per request correlation id? [Completeness, Spec §FR-022, contracts/webview-bridge.md]
- [ ] CHK051 - Is a requirement defined for schema-incompatible store detection with a prompt to re-run with rebuild? [Completeness, Exception, Spec §FR-021]
- [ ] CHK052 - Is the `analyze --json` terminal-event semantics (exactly one terminal event; exit without one = unknown failure; progressbar suppressed under `--json`) specified in the requirement? [Clarity, Spec §FR-019, contracts/analyze-json-progress.md]
- [ ] CHK053 - Is a non-functional requirement defined that the panel uses one long-lived read-only CLI query process with no per-request spawn? [Coverage, Non-Functional, Spec §FR-023, §SC-008]
- [ ] CHK054 - Is a requirement defined that the read-only query process never acquires the writer lock and rejects write-attempting requests? [Completeness, Spec §FR-024, Principle V]
- [ ] CHK055 - Is the CLI executable resolution precedence (`pythonExecutable` -> `cliPath` -> PATH) fixed in the requirement? [Clarity, Spec §FR-014, contracts/extension-manifest.md]
- [ ] CHK056 - Is the stale assumption about `ppi query --format json` replaced with the `ppi rpc` read-only servant mechanism, with no contradictory remaining reference? [Consistency, Spec §Assumptions]
