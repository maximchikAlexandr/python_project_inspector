---
description: "Task list for feature 002 implementation"
---

# Tasks: Restore Lost UI & Metrics Parity, Rename to `ppi`, In-Project `.ppi` Store

**Input**: Design documents from `/specs/002-restore-ui-metrics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (cli.md, analysis-batch.md, http-api.md), quickstart.md

**Tests**: Test tasks ARE included. The feature spec's `quickstart.md` explicitly enumerates "Automated tests to add" (unit/contract/integration), so tests are treated as requested. They are kept proportionate and tied to each story's acceptance criteria.

**Organization**: Tasks are grouped by user story (priority order from spec.md). The cross-cutting package rename and the schema-v2 / contract widening are placed in Foundational because every later story builds on them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependencies)
- **[Story]**: US1..US6 maps to the spec's user stories
- Exact file paths are included in each task

## Path note

All paths use the **post-rename** `src/ppi/` layout. The mechanical rename (`src/python_project_inspector/` → `src/ppi/`) is executed in **Phase 2 (Foundational, T003–T005)**; complete Foundational first so every path below is literal.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization for the new dependencies and test scaffolding.

- [x] T001 [P] Add `d3-force` and `d3-hierarchy` (+ `@types/d3-force`, `@types/d3-hierarchy`) to `frontend/package.json` and install.
- [x] T002 [P] Ensure `tests/unit/`, `tests/contract/`, `tests/integration/` exist with pytest markers, and add a minimal committed fixture Odoo repo (2–3 coupled modules incl. tests, manifest depends, an `ir.rule`) under `tests/fixtures/odoo_sample/`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting prerequisites that MUST complete before any user story. Includes the mechanical rename and the schema-v2 / contract widening shared by US1–US4.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T003 Move the package directory `src/python_project_inspector/` → `src/ppi/` (preserve submodule structure: `core/`, `history/`, `storage/`, `runtime/`, `server/`, `cli/`).
- [x] T004 Update `pyproject.toml`: `name = "ppi"`, `[project.scripts] ppi = "ppi.cli.main:cli"`, hatch `packages = ["src/ppi"]`; remove the old console-script entry.
- [x] T005 Rewrite every intra-package import and identifier `python_project_inspector` → `ppi` across `src/ppi/**` and `tests/**` (including logger names and docstrings); verify `python -c "import ppi"` works.
- [x] T006 Bump `SCHEMA_VERSION = 2` and add the v2 DDL in `src/ppi/storage/schema.py`: new tables `coupling_edge_breakdown`, `coupling_edge_evidence`, `module_model`, `module_manifest_depend`; new columns `file_metric.top_folder`, `module_aggregate.python_file_count`, and scope columns on `project` (per `data-model.md` §2).
- [x] T007 Extend the msgspec contracts in `src/ppi/core/contracts.py`: add `Evidence`, `EdgeBreakdown`, `AnalysisScope`; extend `FileMetrics` (`top_folder`), `ModuleAggregate` (`python_file_count`, `declared_models`, `inherited_models`, `manifest_depends`), `CouplingEdge` (`breakdown`, `evidence`), `ProjectRef` (`scope`); keep `batch_to_json`/`batch_from_json` working (per `contracts/analysis-batch.md`).

**Checkpoint**: Renamed package importable as `ppi`; schema v2 and widened contracts in place.

---

## Phase 3: User Story 1 - Restore lost analysis data (evidence + dropped metrics) (Priority: P1) 🎯 MVP

**Goal**: Capture and persist everything the old tool collected (evidence, edge breakdown, `python_file_count`, `top_folder`, declared/inherited model lists, in-scope manifest depends, selected scope) for each analyzed commit.

**Independent Test**: Analyze the fixture repo, then inspect the store and confirm evidence (kind/file/line/detail), edge breakdown (model_reuse/extension_or_method/view/field_property/total), `python_file_count`, `top_folder`, and model name lists exist at a commit.

### Implementation for User Story 1

- [x] T008 [US1] In `src/ppi/core/odoo/pipeline.py`, make `CouplingEdge` retain evidence (stop `del file_path, line, detail`; append `Evidence`, derive `kind_counter` from it); add pure `edge_breakdown(edge) -> EdgeBreakdown` over the existing `GRAPH_*_KINDS` groups with `edge_score == breakdown.total`; add helpers for `python_file_count` (`len(module.python_complexity_files)`) and `top_folder` (first path segment, `.` fallback).
- [x] T009 [US1] In `src/ppi/core/analyzer.py`, map the new data into `AnalysisBatch`: per-edge `breakdown` + `evidence`, `FileMetrics.top_folder`, `ModuleAggregate.python_file_count` / `declared_models` / `inherited_models` / in-scope `manifest_depends`, and `ProjectRef.scope`.
- [x] T010 [US1] In `src/ppi/core/analyzer.py` (and `src/ppi/history/walker.py` where the report config is built), thread the selected module scope through `build_report_config(...)` instead of the hard-coded `all_modules=True`; in-scope filtering of model lists / manifest depends honors this scope.
- [x] T011 [US1] In `src/ppi/storage/writer.py`, persist the new rows inside the per-commit transaction: `coupling_edge_breakdown`, `coupling_edge_evidence`, `module_model` (declared+inherited), `module_manifest_depend`, plus `top_folder` / `python_file_count` columns and the `project` scope columns; extend `clear_project_data` to truncate the new tables.
- [x] T012 [P] [US1] Unit tests in `tests/unit/`: `edge_breakdown` group math + `total` invariant; `top_folder` derivation incl. module-root `.`; `python_file_count` test/manifest exclusion (per FR-004); `Evidence` round-trip via `batch_to_json`/`batch_from_json`; `AnalysisScope` normalization.
- [x] T013 [P] [US1] Contract test in `tests/contract/`: schema v2 DDL creates the new tables/columns and `write_batch` inserts the expected rows (breakdown/evidence/model/manifest + new columns).
- [x] T014 [US1] Integration test in `tests/integration/`: analyze `tests/fixtures/odoo_sample/`, then assert via direct DuckDB queries that evidence, breakdown, model lists, `top_folder`, and `python_file_count` are stored for a known relation/module at a commit; assert non-scoring kinds (`manifest_depends`, `security_*`) are retained with zero score (FR-007).

**Checkpoint**: MVP — all old-tool data is captured and persisted, verifiable directly from the store.

---

## Phase 4: User Story 6 - Per-project `.ppi` store directory (Priority: P2)

**Goal**: Store each project's DuckDB inside `<repo>/.ppi/` with a self-ignoring `.gitignore`, while worktree/lock/runtime stay user-level.

**Independent Test**: Analyze a project and confirm `<repo>/.ppi/history.duckdb` exists, `<repo>/.ppi/.gitignore` is `*`, and Git shows `.ppi/` untracked.

### Implementation for User Story 6

- [x] T015 [US6] In `src/ppi/runtime/paths.py`, resolve `store_path` to `<repo>/.ppi/history.duckdb`; keep `worktree_path` / `lock_path` / runtime metadata under the user-level analysis dir (per `research.md` D7).
- [x] T016 [US6] In `src/ppi/runtime/paths.py`, create `<repo>/.ppi/` and write a self-ignoring `<repo>/.ppi/.gitignore` containing `*` on creation; if `.gitignore` exists, ensure it still guarantees self-ignore without clobbering unrelated content (Edge Cases).
- [x] T017 [US6] Relax `assert_outside_repo` for the store path only (keep it guarding worktree/lock/runtime) in `src/ppi/runtime/paths.py`, and update `_resolve_context` artifact checks in `src/ppi/cli/main.py` accordingly.
- [x] T018 [US6] Extend `doctor` in `src/ppi/cli/main.py`: add a `.ppi` writability check and a warning when `.ppi/` (or `history.duckdb`) is already tracked in Git.
- [x] T019 [US6] Integration test in `tests/integration/`: `.ppi/history.duckdb` placement, `.ppi/.gitignore == "*"`, `.ppi/` untracked in the analyzed repo, worktree/lock NOT in repo, and fail-fast on an unwritable `.ppi/` (FR-038).

**Checkpoint**: Store lives in-project at `.ppi/` and stays out of Git.

---

## Phase 5: User Story 5 - Use the short name `ppi` (Priority: P2)

**Goal**: Finalize the rename's user-facing surface and prove no old name remains reachable. (The mechanical package/import rename was done in Foundational T003–T005.)

**Independent Test**: `ppi --help` works; `import ppi` works; old console script and `import python_project_inspector` both fail; README product name + repo name unchanged.

### Implementation for User Story 5

- [x] T020 [US5] Update `README.md` usage/command examples to `ppi` while preserving the human-readable product name and the repository name (FR-033).
- [x] T021 [US5] Update remaining non-package references to `ppi` where appropriate (`.vscode/`, docs, fixtures, scripts), without touching README product name or repo name.
- [x] T022 [US5] Integration/guard test in `tests/integration/`: assert `import python_project_inspector` raises, the old console script is absent, and no reachable `python_project_inspector` import path remains (FR-034).

**Checkpoint**: Tool is driven entirely via `ppi`; no reachable old name.

---

## Phase 6: User Story 2 - Read any commit's full state and relation evidence (Priority: P2)

**Goal**: Expose commit-scoped snapshot/parity reads over the US1 data via both CLI and HTTP API.

**Independent Test**: With a populated store, request modules/files/detail/graph/edge-points/edge-evidence at a commit via CLI and HTTP and verify each returns stored data; unknown selectors return typed errors.

### Implementation for User Story 2

- [x] T023 [US2] Add read methods to `src/ppi/storage/queries.py`: `modules_at_commit`, `files_at_commit`, `module_detail`, `file_detail`, `graph_at_commit` (nodes+edges+breakdown, `method_count == cyclomatic.count`), `edge_points`, `edge_evidence`, `module_models`, `manifest_depends`; add `agg` param to `hotspots(...)` (replace hard-coded `_mean`); add the shared edge-inclusion helper (default `score >= 1`, `include_zero_score` toggle).
- [x] T024 [US2] Extend the CLI `query` command in `src/ppi/cli/main.py` with the new metrics and selectors (`--commit`, `--agg`, `--include-zero-score`, `--source`, `--target`) per `contracts/cli.md`.
- [x] T025 [P] [US2] Add Pydantic response models in `src/ppi/server/schemas.py` (`ModuleSnapshotResponse`, `FileSnapshotResponse`, `GraphResponse`/`GraphNode`/`GraphEdge`/`EdgeBreakdownResponse`, `EdgePointsResponse`; extend `EdgeResponse` with `breakdown`).
- [x] T026 [US2] Add HTTP endpoints in `src/ppi/server/api.py`: `/snapshot/modules`, `/snapshot/files`, `/snapshot/module/{name}`, `/snapshot/file`, `/graph`, `/edge-points`; extend `/edges` with `breakdown` + `include_zero_score` (per `contracts/http-api.md`).
- [x] T027 [US2] Implement FR-041 typed errors for unknown commit/module/file/edge selectors, consistent across CLI (`ClickException`) and API (`404`/`422`).
- [x] T028 [P] [US2] Contract tests in `tests/contract/`: CLI new `query` metrics output shapes and API new endpoints/response models.
- [x] T029 [US2] Integration test in `tests/integration/`: snapshot reads match stored data at a commit; CLI vs API parity for the same query (FR-039); unknown-selector error parity (FR-041).

**Checkpoint**: Full commit-scoped reads available on CLI and API.

---

## Phase 7: User Story 3 - Rebuild the interactive Odoo report UI (Priority: P2)

**Goal**: Restore the old report surfaces on the generic, registry-driven frontend, driven by a commit selector and the US2 reads.

**Independent Test**: With a populated store, open the dashboard, pick a commit, and confirm graph, toolbars, detail panels, treemap, tables, edge-points-with-evidence, manifest view, and parse/failure view all render from stored data.

### Implementation for User Story 3

- [x] T030 [US3] Add the frontend registry layer in `frontend/src/registry/` (entity kinds, metric definitions, edge layers, active `odoo` profile) so surfaces are profile-parameterized, not hard-wired (FR-025).
- [x] T031 [US3] Extend the typed API client in `frontend/src/api/client.ts` for snapshot/graph/edge-points/evidence (and the US4 series) endpoints.
- [x] T032 [P] [US3] Module graph component in `frontend/src/components/` using `d3-force` (attraction by points, curved reverse edges), edge thickness = `EdgeBreakdown.total`, drag/select/clear/zoom/fit/pan, and the FR-015 brightness coloring rule (min–max normalize toggled criteria, equal-weight average, single monotonic scale).
- [x] T033 [P] [US3] File treemap component in `frontend/src/components/` using `d3-hierarchy` (tiles sized by lines, colored by `top_folder` with legend, line-category filter, explicit empty state).
- [x] T034 [P] [US3] Line-category toolbar and brightness toolbar in `frontend/src/components/` driving node values/treemap and node coloring.
- [x] T035 [P] [US3] Module detail and file detail panels in `frontend/src/components/` (distributions, method count, code lines, Python file count, parse errors, score in/out / file attributes).
- [x] T036 [P] [US3] Module-code-lines table and Python-file-complexity table in `frontend/src/components/` with module/path filters and a visible-rows counter.
- [x] T037 [P] [US3] Edge-points table in `frontend/src/components/` with per-category points, edge total, the "why points" explanation (contributing kinds + counts), evidence stack, and source/target + min-points filters.
- [x] T038 [P] [US3] Manifest dependency view and parse/failure view in `frontend/src/components/`.
- [x] T039 [US3] Snapshot page in `frontend/src/pages/` with a shared commit selector wiring all surfaces (FR-023), integrated into `App.tsx` routing/nav.

**Checkpoint**: Full interactive report parity at any analyzed commit.

---

## Phase 8: User Story 4 - Trustworthy, history-aware analytics (Priority: P3)

**Goal**: Fix consistency defects (aggregation-aware hotspots; single edge-inclusion rule everywhere) and add new history series + relations diff.

**Independent Test**: Pick a non-mean aggregation and confirm hotspots match the complexity chart; confirm chart edge count == table rows == CLI/API for a given toggle; request per-category line, file-count, edge-kind series and a between-commits relations diff.

### Implementation for User Story 4

- [x] T040 [US4] Add series queries to `src/ppi/storage/queries.py`: `module_lines_by_category_timeseries`, `python_file_count_timeseries`, `edge_kind_timeseries`, `relations_diff(commit_a, commit_b)`.
- [x] T041 [US4] Apply the shared edge-inclusion rule uniformly (FR-027) across `coupling_structure_timeseries`/`edges` in `src/ppi/storage/queries.py`, the `/structure/timeseries` + `/edges` endpoints in `src/ppi/server/api.py`, and the CLI edge reads in `src/ppi/cli/main.py`, so all surfaces agree for a given `include_zero_score`.
- [x] T042 [US4] Expose new series + relations-diff + edge-kinds via CLI (`src/ppi/cli/main.py`), API endpoints (`/metrics/timeseries` extensions for `lines_by_category`/`python_file_count`, `/edge-kinds/timeseries`, `/relations/diff`) in `src/ppi/server/api.py`, and `src/ppi/server/schemas.py`; make `/hotspots` accept `agg`.
- [x] T043 [US4] Frontend in `frontend/src/`: hotspots aggregation control, per-category line series, `python_file_count` series, edge-kind series, and relations-diff view; reconcile the structure chart with the edge table via the shared toggle.
- [x] T044 [P] [US4] Tests in `tests/`: hotspots honor `agg` (median/p95/max ≠ mean); edge-inclusion parity across chart/table/CLI/API for both toggle values; series + relations-diff correctness.

**Checkpoint**: Analytics are internally consistent and history-aware.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T045 [P] Refresh the Russian translation `specs/002-restore-ui-metrics/spec.ru.md` to match the final `spec.md`.
- [x] T046 [P] Update `README.md` / docs for the new metrics, restored UI, and `.ppi/` store behavior.
- [ ] T047 Run `quickstart.md` validation scenarios 1–9 end-to-end.
- [x] T048 [P] `cd frontend && npm run build` and verify `ppi serve` serves the built UI (not the fallback).
- [x] T049 Code-style sweep over new/renamed Python: double quotes, Google-style English docstrings, no narrating comments, module-level imports, concise solutions; run linters and fix.

---

## Phase 10: Convergence (post-review gaps)

- [x] T050 Fix HTTP `/api/edges` zero-score parity and expose FR-008 relation counts (`kind_occurrence_count`, `evidence_count`) per FR-027/FR-008/SC-005
- [x] T051 Restore graph interactivity and FR-015 brightness normalization in `frontend/src/components/ModuleGraph.tsx` and `frontend/src/registry/odooProfile.ts` per FR-013/FR-015/SC-003
- [x] T052 Complete Analytics UI for FR-028–FR-030 in `frontend/src/pages/AnalyticsPage.tsx` per SC-006
- [x] T053 Enhance detail panels and edge-points presentation in `frontend/src/components/*` per FR-016/FR-018/FR-021
- [x] T054 Add HTTP edge-inclusion and module-scope integration tests in `tests/integration/` per T044/FR-040
- [x] T055 Remove stale `src/python_project_inspector/` tree per FR-034/T003
- [x] T056 Add contract tests for snapshot/graph/failures/relations-diff HTTP endpoints in `tests/contract/` per T028/FR-039
- [x] T057 Expose standalone `edge-evidence` read on CLI and HTTP API per FR-010/FR-039, or document edge-points embedding as intentional
- [x] T058 Expand registry-driven UI beyond `odooProfile.ts` constants per FR-025, or record ADR accepting minimal profile binding

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. Includes the rename (T003–T005) and schema/contracts (T006–T007). **BLOCKS all user stories.**
- **US1 (Phase 3)**: Depends on Foundational. MVP.
- **US6 (Phase 4)**: Depends on Foundational (independent of US1; can run alongside US1).
- **US5 (Phase 5)**: Depends on Foundational (rename already done there); README/acceptance only.
- **US2 (Phase 6)**: Depends on US1 (needs the stored data to read).
- **US3 (Phase 7)**: Depends on US2 (consumes the reads).
- **US4 (Phase 8)**: Depends on US2 (shared edge-inclusion helper, series over stored data); UI part depends on US3.
- **Polish (Phase 9)**: Depends on the targeted stories being complete.

### Within Each User Story

- Pipeline/contract changes before writer/query persistence; queries before CLI/API; CLI/API before frontend; tests alongside or after the code they cover.

### Parallel Opportunities

- Setup: T001, T002 in parallel.
- US1: T012, T013 in parallel (T014 after T008–T011).
- US2: T025 parallel with T023/T024; T028 parallel after endpoints.
- US3: T032–T038 are largely parallel (distinct component files) after T030/T031; T039 integrates them.
- US4: T044 parallel after T040–T043.
- Polish: T045, T046, T048 in parallel.

---

## Parallel Example: User Story 3

```bash
# After the registry (T030) and API client (T031) land, build components in parallel:
Task: "Module graph component (d3-force) in frontend/src/components/"
Task: "File treemap component (d3-hierarchy) in frontend/src/components/"
Task: "Line-category + brightness toolbars in frontend/src/components/"
Task: "Module/file detail panels in frontend/src/components/"
Task: "Code-lines + file-complexity tables in frontend/src/components/"
Task: "Edge-points table with evidence in frontend/src/components/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (rename + schema v2 + contracts) → 3. Phase 3 US1.
4. **STOP and VALIDATE**: analyze the fixture, confirm evidence/breakdown/model lists/`top_folder`/`python_file_count` in the store.

### Incremental Delivery

1. Foundation ready (rename + schema + contracts).
2. US1 (data capture) → MVP.
3. US6 (`.ppi/` store) + US5 (rename acceptance) → operational changes landed.
4. US2 (reads on CLI + API) → data is consumable.
5. US3 (interactive UI) → visible parity restored.
6. US4 (consistency + new series) → trustworthy, history-aware analytics.
7. Polish → translation, docs, quickstart validation, frontend build, style sweep.

---

## Notes

- [P] = different files, no incomplete-task dependencies.
- Complete Foundational (incl. the rename) before anything else so all `src/ppi/` paths are literal.
- The shared edge-inclusion helper is introduced in US2 (T023) and applied everywhere in US4 (T041); keep them consistent.
- No source quotes are captured this feature (evidence = kind/file/line/detail only).
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
