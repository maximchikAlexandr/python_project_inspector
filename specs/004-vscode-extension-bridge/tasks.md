# Tasks: VS Code Extension — Thin Bridge

**Input**: Design documents from `/specs/004-vscode-extension-bridge/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md, constitution.md

**Tests**: Included for normative contract surfaces (progress events, query-dispatch parity, RPC stdio, DataSource parity, settings precedence) because `contracts/` and `quickstart.md` define them as verification artifacts (SC-003/SC-005/SC-008 depend on them). Story-level unit/integration tests are included where they verify a contract or an independent-test criterion.

**Organization**: Tasks grouped by user story (US1=P1, US2=P2, US3=P3) for independent implementation/testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths included in every task

## Path Conventions

- Python package: `src/ppi/...`, tests in `tests/...`
- Frontend: `frontend/...`
- Extension: `vscode-extension/...` (new top-level directory)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the VS Code extension project and the frontend Webview build target.

- [x] T001 Create `vscode-extension/` scaffold with manifest `vscode-extension/package.json` (`engines.vscode` ^1.100.0, `license`/`repository`/`version`/`publisher`, commands `ppi.analyze`/`ppi.openDashboard`/`ppi.cancelAnalysis`, activation `onStartupFinished`, `contributes.configuration` for `ppi.profile`/`ppi.analysisDir`/`ppi.pythonExecutable`/`ppi.cliPath`) per contracts/extension-manifest.md
- [x] T002 [P] Create `vscode-extension/tsconfig.json` and `vscode-extension/esbuild.mjs` bundler config (extension host entry → `dist/extension.js`; webview entry → `dist-webview`)
- [x] T003 [P] Create `vscode-extension/.vscodeignore`, `vscode-extension/README.md`, `vscode-extension/LICENSE` placeholder
- [x] T004 [P] Add frontend Webview build target: `build:webview` script in `frontend/package.json` and webview entry config in `frontend/vite.config.ts` (output `frontend/dist-webview`)

**Checkpoint**: Extension project builds empty; frontend has a webview build script.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared extension core used by ALL user stories (CLI resolution, settings, typed contracts, activation). MUST complete before any story.

- [x] T005 Create TS contracts mirror `vscode-extension/src/contracts.ts` (ProgressEvent union, RpcRequest/RpcResponse/RpcError, WebviewMessage kinds, AnalysisRun/WorkspaceProfile/DashboardView state types) per contracts/*.md and data-model.md
- [x] T006 Implement CLI executable resolution in `vscode-extension/src/env.ts` (precedence `pythonExecutable` → `cliPath` → PATH `ppi`; spawn args `<exe> -m ppi` vs `<cliPath>` vs `ppi`; `ENOENT` → `CliNotFound`) per Spec §FR-014, contracts/extension-manifest.md
- [x] T007 Implement settings resolution in `vscode-extension/src/settings.ts` (read `ppi.profile`/`ppi.analysisDir`/`ppi.pythonExecutable`/`ppi.cliPath`; VS Code native workspace-over-global precedence; resolve effective profile/analysisDir) per Spec §FR-011, §FR-012, §FR-013
- [x] T008 Implement `activate()` + command/status-bar registration skeleton in `vscode-extension/src/extension.ts` (register `ppi.analyze`, `ppi.openDashboard`, `ppi.cancelAnalysis`; status-bar item shown when a workspace folder is open) per Spec §FR-001, contracts/extension-manifest.md

**Checkpoint**: Foundation ready — stories can be implemented in parallel/sequence.

---

## Phase 3: User Story 1 — Launch analysis from the editor and see it finish (Priority: P1) 🎯 MVP

**Goal**: Trigger `ppi analyze` from VS Code, show live `--json` progress, completion/error, and basic cancel with stale-lock recovery.

**Independent Test**: Open a workspace, run `PPI: Analyze Project`, verify the analysis executes (DuckDB store updated) and progress/completion/failure is reported without opening a dashboard or browser (Spec §US1).

### Tests for User Story 1

- [x] T009 [P] [US1] Contract test for `analyze --json` progress events (ordering, terminal-event semantics, suppression of human output) in `tests/contract/test_analyze_json_progress.py`

### Implementation for User Story 1

- [x] T010 [US1] Create `msgspec` progress event structs + JSON-lines emitter in `src/ppi/runtime/progress.py` (`RunStarted`/`CommitProgress`/`RunCompleted`/`RunFailed`, line-flushed) per contracts/analyze-json-progress.md
- [x] T011 [US1] Add `--json` flag to `ppi analyze` in `src/ppi/cli/main.py` (emit events on stdout, suppress `click.progressbar`, exactly one terminal event, fold summary into `RunCompleted`; `--jsonl` unchanged; analysis logic untouched) per Spec §FR-019
- [x] T012 [US1] Implement `analyzeRunner` in `vscode-extension/src/analyzeRunner.ts` (spawn `ppi analyze --json` with resolved profile/analysisDir, line-parse stream, map events to status updates, cancel via `SIGTERM`→`SIGKILL`, status → `cancelled`) per Spec §FR-001, §FR-002, §FR-020
- [x] T013 [US1] Implement post-cancel stale-lock recovery in `vscode-extension/src/analyzeRunner.ts` (run `ppi doctor --recover-stale` or equivalent after termination) so the next run is not blocked per Spec §FR-020
- [x] T014 [US1] Implement status bar + notifications in `vscode-extension/src/status.ts` (live progress, completion with `View Dashboard` action, failure with `Retry` + failing `stderr_tail`, CLI-not-found with `Open Settings`) per Spec §FR-002, §FR-003, §FR-004, §FR-014
- [x] T015 [US1] Wire `ppi.analyze` command in `vscode-extension/src/extension.ts` (resolve target folder via QuickPick if multi-folder, single-run guard offering cancel, launch runner with `env`+`settings`) per Spec §FR-005, §FR-006, §FR-017
- [x] T016 [US1] Wire `ppi.cancelAnalysis` command in `vscode-extension/src/extension.ts` per Spec §FR-020
- [x] T017 [P] [US1] Unit tests for `analyzeRunner` progress parsing + cancel lifecycle in `vscode-extension/test/unit/analyzeRunner.test.ts`

**Checkpoint**: US1 fully functional and independently testable — analyze from command palette, see progress/completion, cancel.

---

## Phase 4: User Story 2 — View the analytics dashboard inside the editor (Priority: P2)

**Goal**: Render the existing frontend in a Webview panel backed by a read-only `ppi rpc` servant, with browser parity and no HTTP server.

**Independent Test**: Given a completed analysis, open `PPI: Open Dashboard`, confirm it renders the same reports as the browser dashboard, backed by exactly one `ppi rpc` process, no `ppi serve` (Spec §US2, §SC-008).

### Tests for User Story 2

- [x] T018 [P] [US2] Contract test for query-dispatch parity (`ppi rpc` JSON == `ppi serve` `/api` JSON for every method over a fixture store) in `tests/contract/test_query_dispatch_parity.py`
- [x] T019 [P] [US2] Integration test for `ppi rpc` stdio JSON-RPC protocol (request/response correlation, error codes, read-only rejection, `rpc.close`) in `tests/integration/test_rpc_stdio.py`

### Implementation for User Story 2

- [x] T020 [US2] Create `msgspec` RPC contracts in `src/ppi/query/contracts.py` (`RpcRequest`/`RpcResponse`/`RpcError`, error code enum) per contracts/query-rpc.md
- [x] T021 [US2] Extract shared query dispatcher in `src/ppi/query/dispatch.py` from `src/ppi/server/api.py` (endpoint id → `StoreReader` call → dict/list; cover the full surface incl. `status`/`commits`/`catalog`/`hotspots`/`structure/timeseries`/`snapshot/modules`/`snapshot/files`/`edge-points/batch`) per contracts/cli-query-surface.md
- [x] T022 [US2] Refactor `src/ppi/server/api.py` to delegate to `ppi.query.dispatch` (no behavior change; keep FastAPI only here) per Plan §R3. `ppi serve` now uses the same shared dispatcher as `ppi rpc`, and the parity contract test (T018) guards equivalence across both read interfaces.
- [x] T023 [US2] Add `ppi rpc` command in `src/ppi/cli/main.py` (long-lived read-only stdio JSON-RPC loop over `ppi.query.dispatch`; lazy/reused `StoreReader`; reject write-attempting methods; no writer lock; exit on stdin EOF / `rpc.close`) per contracts/query-rpc.md, Spec §FR-023, §FR-024
- [x] T024 [US2] Implement `DataSource` abstraction in `frontend/src/api/dataSource.ts` (`DataSource` interface, `HttpDataSource` via `fetch`, `WebviewDataSource` via `postMessage` + correlation-id promises) per contracts/webview-bridge.md, Spec §FR-018
- [x] T025 [US2] Refactor `frontend/src/api/client.ts` `fetch*` helpers to delegate to an injectable `DataSource` set at bootstrap (no behavior change for browser) per Plan §R4
- [x] T026 [US2] Create Webview entry `frontend/src/webview-main.tsx` (guard `acquireVsCodeApi()` once, wire `WebviewDataSource`, bootstrap the existing `App`) per Spec §FR-007, §FR-018
- [x] T027 [US2] Implement `queryBridge` in `vscode-extension/src/queryBridge.ts` (spawn/own one `ppi rpc` per panel, JSON-RPC request/response, teardown on panel dispose, restart on servant death) per Spec §FR-023, contracts/query-rpc.md
- [x] T028 [US2] Implement `webviewPanel` in `vscode-extension/src/webviewPanel.ts` (`createWebviewPanel`, CSP, `asWebviewUri` for `dist-webview`, message routing, exactly-one-response-per-id correlation, empty-state `command` handling) per Spec §FR-007, §FR-008, §FR-009, §FR-010, §FR-022, contracts/webview-bridge.md
- [x] T029 [US2] Wire `ppi.openDashboard` command in `vscode-extension/src/extension.ts` (resolve folder, spawn `queryBridge`, open panel) per Spec §FR-008
- [x] T030 [P] [US2] Frontend `DataSource` parity unit tests (HttpDataSource vs WebviewDataSource request/response shape) in `frontend/src/api/dataSource.test.ts` (vitest)
- [x] T031 [US2] Extension integration test for dashboard panel end-to-end (open panel, issue a `graph` request, assert response) in `vscode-extension/test/dashboard.test.ts` via `@vscode/test-electron`

**Checkpoint**: US1 + US2 both work independently — dashboard parity with browser, no server, one `ppi rpc` per panel.

---

## Phase 5: User Story 3 — Configure how the workspace is analyzed via extension settings (Priority: P3)

**Goal**: Per-workspace profile (`python`/`odoo`) + results dir + interpreter config, with precedence, multi-folder selection, and re-run prompts.

**Independent Test**: Set `ppi.profile`=`odoo`, run analysis, observe Odoo interpretation in dashboard; switch to `python`, re-run, observe plain-Python behavior (Spec §US3, §SC-004).

### Tests for User Story 3

- [x] T032 [P] [US3] Unit tests for settings precedence (workspace > global) and profile/analysisDir resolution in `vscode-extension/test/unit/settings.test.ts`

### Implementation for User Story 3

- [x] T033 [US3] Implement CLI invocation with resolved profile + analysis dir in `vscode-extension/src/settings.ts`/`extension.ts` (pass `--profile` and analysis dir to `ppi analyze`/`ppi rpc`; empty `analysisDir` → CLI default) per Spec §FR-011, §FR-013
- [x] T034 [US3] Implement multi-folder QuickPick selection + status-bar target indication in `vscode-extension/src/extension.ts` per Spec §FR-017
- [x] T035 [US3] Implement profile-change re-run prompt in `vscode-extension/src/extension.ts` (detect CLI error on profile change without `--rebuild`, offer re-run with rebuild) per Spec §SC-004
- [x] T036 [US3] Implement schema-incompatible store detection + re-run-with-rebuild prompt in `vscode-extension/src/webviewPanel.ts`/`status.ts` (via `status` response `schema_compatible=false`) per Spec §FR-021
- [x] T037 [US3] Implement `Open Settings` action wiring from CLI-not-found notification and dashboard empty-state in `vscode-extension/src/status.ts`/`webviewPanel.ts` per Spec §FR-014, §FR-010

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Packaging, hardening, docs, and end-to-end validation across all stories.

- [x] T038 [P] Configure `vsce` packaging scripts (`vscode:prepublish` → esbuild, `package` → `vsce package`, `publish` → `vsce publish`) in `vscode-extension/package.json`
- [x] T039 [P] Finalize `vscode-extension/.vscodeignore` (exclude `src`, `test`, `node_modules`, `tsconfig.json`, `esbuild.mjs`, Python/frontend sources; include `dist`, `dist-webview`, `media`, `package.json`, `README.md`, `LICENSE`)
- [x] T040 Harden Webview CSP using dynamic `webview.cspSource` + per-load script nonce (NOT literal `vscode-resource:`) and restrict `localResourceRoots` to `dist-webview`/`media` in `vscode-extension/src/webviewPanel.ts` per contracts/extension-manifest.md
- [x] T041 [P] Write extension user documentation in `vscode-extension/README.md` (install, settings, commands, packaging)
- [x] T042 Run `quickstart.md` end-to-end validation. Automated verification now includes: (a) `@vscode/test-electron` integration test PASSES — VS Code 1.125.1 (auto-downloaded) loads the dev extension and the suite confirms activate() + all 4 commands registered (exit 0); (b) webview bundle mounts the dashboard App in headless Chrome with mocked `acquireVsCodeApi` (`test/webview-render.test.ts`); (c) `analyze --json` E2E stream + `ppi rpc` parity + cancel lifecycle + QueryBridge dashboard data path + settings precedence all green. Residual manual-only: literal GUI click-through of `PPI: Open Dashboard` panel inside a VS Code session with `ppi` configured (visual acceptance), and `python` profile switch (Stage 11 — `python` profile not implemented in the CLI this stage).
- [x] T043 [P] Lint/format: `ruff` on new Python files (`src/ppi/runtime/progress.py`, `src/ppi/query/`, `src/ppi/cli/main.py`, `src/ppi/server/api.py`) and `tsc --noEmit` on `vscode-extension` + `frontend`
- [x] T044 [P] Update repo `README.md` with extension build/install section and add `vscode-extension/` to repo top-level docs

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: no dependencies.
- **Phase 2 Foundational**: depends on Phase 1; BLOCKS all user stories.
- **Phase 3 US1 (MVP)**: depends on Phase 2 only.
- **Phase 4 US2**: depends on Phase 2; independent of US1 (dashboard can be tested against an existing completed analysis). The Python dispatcher refactor (T021–T023) is internal to US2.
- **Phase 5 US3**: depends on Phase 2; builds on US1 (analyze) and US2 (dashboard) for integration but each setting task is independently testable.
- **Phase 6 Polish**: depends on the stories being complete.

### User Story Dependencies

- **US1 (P1)**: Phase 2 only. No dependency on other stories. MVP.
- **US2 (P2)**: Phase 2 only. Requires a completed analysis to be meaningful but can be developed/tested against a pre-existing store (does not require US1 code).
- **US3 (P3)**: Phase 2; integrates with US1 (re-run) and US2 (schema prompt in panel) but setting-resolution tasks are independently testable.

### Within Each Story

- Contract/parity tests before the implementation that satisfies them (T009→T010/T011; T018/T019→T020–T023; T032→T033).
- Python contracts before CLI commands; CLI commands before extension clients; frontend `DataSource` before webview entry; webview entry before panel host.

### Parallel Opportunities

- Phase 1: T002, T003, T004 in parallel (different files).
- Phase 2: T005, T006, T007 in parallel after T001 (different files); T008 after T005–T007.
- US1: T009 (test) parallel with T010 (Python contract, different file/language).
- US2: T018, T019 (tests) parallel; T024, T025, T026 (frontend) parallel with T020–T023 (Python) — different languages/repos; T030 parallel with T027/T028.
- US3: T032 (test) parallel with T033–T037 implementation where files differ.
- Phase 6: T038, T039, T041, T043, T044 parallel.

---

## Parallel Example: User Story 2

```bash
# Python side and frontend side can proceed simultaneously (different repos/languages):
Task: "Extract shared query dispatcher in src/ppi/query/dispatch.py"        # T021
Task: "Implement DataSource abstraction in frontend/src/api/dataSource.ts"  # T024

# Independent contract tests run in parallel:
Task: "Contract test for query-dispatch parity in tests/contract/test_query_dispatch_parity.py"  # T018
Task: "Integration test for ppi rpc stdio in tests/integration/test_rpc_stdio.py"                # T019
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1): `analyze --json` + `analyzeRunner` + status/cancel commands.
3. **STOP and VALIDATE**: run `PPI: Analyze Project` from the editor, observe progress/completion/cancel without any dashboard.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. +US1 → analyze-from-editor works (MVP).
3. +US2 → dashboard inside the editor with parity, no server.
4. +US3 → profile/settings/multi-folder/re-run prompts.
5. Phase 6 → packaged `.vsix`, hardened CSP, docs, quickstart green.

### Parallel Team Strategy

- One dev on Python (`ppi` CLI: `--json`, `ppi rpc`, dispatcher).
- One dev on the extension (`vscode-extension/`).
- One dev on the frontend (`DataSource`, webview entry).
- Foundational phase done together; then US1/US2/US3 proceed in parallel by area.

---

## Notes

- [P] = different files, no dependencies on incomplete tasks.
- [Story] maps a task to its user story for traceability.
- Each story is independently completable and testable.
- Commit after each task or logical group (Conventional Commits per constitution).
- Verify contract tests fail before the implementation that satisfies them.
- Preserve core independence (Principle II): no VS Code/transport/HTTP imports in `src/ppi/` outside `ppi.server`/`ppi.query` adapters; `ppi.query` must not import FastAPI.
- Preserve single-writer (Principle V): `ppi rpc` is read-only; all writes via `ppi analyze`.
