---

description: "Task list for Git History Metrics Pipeline (MVP Stages 1-4)"
---

# Tasks: Git History Metrics Pipeline (MVP Stages 1-4)

**Input**: Design documents from `/specs/001-git-history-metrics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (all present)

**Tests**: Included (lean contract + integration tests), justified by the constitution's quality gates and the contracts/quickstart validation scenarios.

**Organization**: Tasks are grouped by user story. This feature is a pipeline, so later stories build on earlier ones; dependencies are stated explicitly. The MVP is User Story 1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1/US2/US3/US4 (Setup/Foundational/Polish carry no story label)

## Path Conventions

Single installable package: `src/python_project_inspector/`, tests in `tests/`, frontend in `frontend/` (per plan.md Structure Decision).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and structure

- [x] T001 Create package skeleton with `__init__.py` files for `src/python_project_inspector/{core,history,storage,runtime,server,cli}/` and `tests/{unit,integration,contract}/`, `frontend/` per plan.md
- [x] T002 Create `pyproject.toml` (Python 3.11+, console entry point `python-project-inspector` → `python_project_inspector.cli.main:cli`, deps: click, duckdb, msgspec, Expression, toolz, radon, complexipy, fastapi, uvicorn, psutil; dev: pytest) and confirm `uv sync` (`anyio` is intentionally omitted in the MVP — it enters with the worker/runtime stages)
- [x] T003 [P] Configure ruff/formatter for the code style (double quotes, module-level imports, docstring rules) in `pyproject.toml`/`ruff.toml` and `pytest` config

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core contracts and the reused analyzer that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 [P] Define `msgspec` contracts in `src/python_project_inspector/core/contracts.py` (ProjectRef, CommitRef, Distribution, FileMetrics, ModuleAggregate, CouplingEdge, FailureRecord, AnalysisBatch, RunMeta) per `contracts/analysis-batch.md`
- [x] T005 Migrate pure metric transforms from `report.py` into `src/python_project_inspector/core/odoo/pipeline.py` (line/size counts, radon cyclomatic, complexipy cognitive, jones AST density, distribution stats) as pure functions returning `Result` where fallible
- [x] T006 Implement built-in analyzer provider `src/python_project_inspector/core/analyzer.py`: `analyze_worktree(path, profile_config) -> Result[AnalysisBatch]` adapting `report.py` module discovery, per-file/module metrics, and coupling edges (no I/O beyond reading the worktree)
- [x] T007 [P] Implement `src/python_project_inspector/runtime/paths.py`: derive `project_id`, analysis dir, store path, worktree dir, and lock path resolved OUTSIDE the analyzed repo (FR-027)
- [x] T008 [P] Implement git plumbing `src/python_project_inspector/history/git.py`: list non-merge commits oldest→newest (`rev-list --no-merges --reverse`), read commit metadata, all with captured (non-inherited) output

**Checkpoint**: Contracts + analyzer + paths + git plumbing ready

---

## Phase 3: User Story 1 - Collect metrics across the full Git history (Priority: P1) 🎯 MVP

**Goal**: Walk a repo's non-merge commits in an isolated worktree, run the analyzer at each commit, and emit per-commit metrics in a stable format with a progress bar and hidden checkout — without disturbing the user's working tree.

**Independent Test**: Run `analyze` against the example repository; verify per-commit results, progress bar (no checkout output), and that the repo's branch/working tree are unchanged.

### Tests for User Story 1

- [x] T009 [P] [US1] Integration test in `tests/integration/test_history_walk.py`: walk a small fixture repo, assert one batch per non-merge commit, chronological order, and pre/post working-tree non-interference (SC-002)
- [x] T010 [P] [US1] Contract test in `tests/contract/test_result_format.py`: stable result format (AnalysisBatch → JSONL) keyed by `commit + file + metrics` (FR-008)

### Implementation for User Story 1

- [x] T011 [US1] Implement `src/python_project_inspector/history/worktree.py`: create detached worktree, silent per-commit checkout (captured output), cleanup/reuse, and stale-worktree recovery (FR-003, FR-006, FR-009)
- [x] T012 [US1] Implement `src/python_project_inspector/history/walker.py`: iterate non-merge commits, drive `analyzer.analyze_worktree`, collect `FailureRecord`s and continue on failure, yield `AnalysisBatch` per commit (FR-001, FR-002, FR-007)
- [x] T013 [US1] Add `click.progressbar` progress (current/total + short hash) and ensure no checkout output reaches stdout/stderr in `history/walker.py` + `cli/main.py` (FR-005, FR-006)
- [x] T014 [US1] Implement stable JSONL result emitter for `AnalysisBatch` in `src/python_project_inspector/core/contracts.py` helpers or `cli/main.py` (FR-008)
- [x] T015 [US1] Wire a minimal `analyze` command (no store yet) in `src/python_project_inspector/cli/main.py` that runs the walk and prints a succeeded/failed summary (FR-001, SC-001, SC-006)

**Checkpoint**: US1 fully functional — history metrics collected and emitted, working tree untouched

---

## Phase 4: User Story 2 - Persist history into a durable, queryable store (Priority: P2)

**Goal**: Persist analyzer output per commit into a per-project DuckDB store via a single writer, with incremental re-runs and a `query` path.

**Independent Test**: Run analysis writing to the store, then `query --metric complexity --module X` returns chronological rows in <5s without re-analysis.

**Depends on**: US1 (consumes `AnalysisBatch` from the walker).

### Tests for User Story 2

- [x] T016 [P] [US2] Contract test in `tests/contract/test_store_schema.py`: DDL tables + `schema_version` match `data-model.md` (FR-013, FR-014)
- [x] T017 [P] [US2] Integration test in `tests/integration/test_store_query.py`: analyze → persist → query module complexity-over-time; re-run is incremental and non-duplicating (FR-015, SC-007)

### Implementation for User Story 2

- [x] T018 [P] [US2] Implement `src/python_project_inspector/storage/schema.py`: DDL for `meta`, `project`, `analysis_run`, `commit`, `file_metric`, `module_aggregate`, `coupling_edge`, `coupling_edge_kind`, `failure`; `SCHEMA_VERSION` + compatibility check (FR-013, FR-014)
- [x] T019 [US2] Implement `src/python_project_inspector/runtime/lock.py`: per-project write lock with PID-liveness/stale-lock recovery via `psutil`
- [x] T020 [US2] Implement `src/python_project_inspector/storage/writer.py`: single writer mapping `AnalysisBatch` → tables in one transaction per commit (FR-011, FR-012)
- [x] T021 [US2] Implement incremental selection (read stored commit hashes; skip existing) and `--rebuild` (clear project data) in `storage/writer.py` + `history/walker.py` (FR-015)
- [x] T022 [P] [US2] Implement read-only analytical queries in `src/python_project_inspector/storage/queries.py` (complexity/lines over time per module/file; edges) for FR-013/SC-003
- [x] T023 [US2] Update `analyze` to persist via the writer under the lock and add `--rebuild`; add `query` command (metric/module/file/format, read-only) in `src/python_project_inspector/cli/main.py` (FR-010–FR-015)

**Checkpoint**: US1 + US2 work — history is durably stored and queryable

---

## Phase 5: User Story 4 - Use the tool as an installable CLI product (Priority: P2)

**Goal**: One installable package with a unified CLI (consistent global config), a working `doctor`, and docs.

**Independent Test**: Install into a clean env; `--help` lists `analyze/query/serve/doctor`; `doctor` reports prerequisites; config resolves consistently across commands.

**Depends on**: US1, US2 (provides `analyze`/`query`); `serve` becomes fully functional with US3.

### Tests for User Story 4

- [x] T024 [P] [US4] Contract test in `tests/contract/test_cli_contract.py`: `--help` exposes `analyze/query/serve/doctor` and global options per `contracts/cli.md`

### Implementation for User Story 4

- [x] T025 [US4] Implement shared CLI context resolving `--repo/--branch/--profile/--analysis-dir` consistently for all subcommands in `src/python_project_inspector/cli/main.py` (FR-024)
- [x] T026 [US4] Implement `doctor` command (git availability, repo/branch validity, analysis-dir writability, store openable + schema check, stale lock/worktree detection) in `src/python_project_inspector/cli/main.py` (FR-023, US4-AC5)
- [x] T027 [US4] Finalize console entry point and `serve` command registration (placeholder until US3) and verify `uv run python-project-inspector` works (FR-021, FR-022)
- [x] T028 [P] [US4] Write `README.md` with install + run-each-command docs (FR-025, FR-026)
- [x] T029 [US4] Verify analysis artifacts (store, worktree, lock, runtime) stay outside the analyzed repo via `runtime/paths.py` (FR-027, SC-008)

**Checkpoint**: Installable CLI product with analyze/query/doctor; serve registered

---

## Phase 6: User Story 3 - Explore history through reports and a dashboard (Priority: P3)

**Goal**: A FastAPI server + React/Mantine dashboard reading the store, showing complexity-over-time, top-N hotspots, file-size history, and analysis status.

**Independent Test**: With a populated store, `serve` and open the dashboard; verify all four views render entirely from stored data.

**Depends on**: US2 (store) and US4 (`serve` wiring).

### Tests for User Story 3

- [x] T030 [P] [US3] Contract test in `tests/contract/test_http_api.py`: endpoints/shapes for `/status`, `/commits`, `/catalog`, `/metrics/timeseries`, `/hotspots`, `/edges` plus 409/503 per `contracts/http-api.md`

### Implementation for User Story 3

- [x] T031 [US3] Implement FastAPI factory `src/python_project_inspector/server/app.py`: read-only store access, "analysis in progress" (409) when writer lock held
- [x] T032 [US3] Implement endpoints in `src/python_project_inspector/server/api.py`: `/status`, `/commits`, `/metrics/timeseries`, `/hotspots`, `/edges` (FR-016–FR-021) using `storage/queries.py`
- [x] T033 [US3] Implement full `serve` command (host/port/--open) serving API + static frontend in `src/python_project_inspector/cli/main.py` (FR-016)
- [x] T034 [P] [US3] Scaffold `frontend/` (React + Mantine + TypeScript + Vite) with a typed API client in `frontend/src/api/`
- [x] T035 [P] [US3] Implement dashboard views in `frontend/src/components/` + `frontend/src/pages/`: complexity-over-time (file + module), top-N hotspots (value + growth), line-count history, structure/coupling edges, status page (FR-017, FR-018, FR-019, FR-020)
- [x] T036 [US3] Build and integrate the frontend bundle served by `serve` (FR-016, SC-004)

**Checkpoint**: All user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T037 [P] Add unit tests for pure core transforms in `tests/unit/` (pipeline distribution/edge scoring, contracts, API helpers)
- [x] T038 [P] Add structured, non-checkout logging via `runtime/log.py` and failure warnings in `cli/main.py`
- [x] T039 Retire legacy root `report.py`/`main.py` after migration; update any references and `templates/` reuse
- [x] T040 Performance pass: `tests/integration/test_quickstart_flow.py` asserts query < 5s on fixture (SC-003)
- [x] T041 Run `quickstart.md` validation via `test_quickstart_flow.py` and edge-case tests; **SC-001** deferred for manual validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all stories
- **US1 (Phase 3)**: depends on Foundational — the MVP
- **US2 (Phase 4)**: depends on US1 (consumes the walker's batches)
- **US4 (Phase 5)**: depends on US1 + US2 (`serve` completed in US3)
- **US3 (Phase 6)**: depends on US2 (store) + US4 (`serve` wiring)
- **Polish (Phase 7)**: after the desired stories

### Within Each User Story

- Tests before implementation; contracts/models before services; services before CLI/endpoints; core before integration.

### Parallel Opportunities

- Setup: T003 in parallel with T001/T002 once skeleton exists.
- Foundational: T004, T007, T008 in parallel; T005→T006 sequential (analyzer uses metrics).
- US1: T009, T010 (tests) in parallel; then T011→T012→T013, with T014 parallelizable.
- US2: T016, T017 (tests) and T018, T022 in parallel; T019/T020/T021/T023 sequential on the writer/lock.
- US3: T034, T035 (frontend) in parallel with backend T031/T032.

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel):
Task: "Integration test history walk in tests/integration/test_history_walk.py"
Task: "Contract test result format in tests/contract/test_result_format.py"

# Then implementation (worktree → walker → progress):
Task: "Implement history/worktree.py"
Task: "Implement history/walker.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE** → demo.

### Incremental Delivery

US1 (collect) → US2 (store + query) → US4 (installable CLI + doctor) → US3 (dashboard). Each adds value without breaking prior stories.
