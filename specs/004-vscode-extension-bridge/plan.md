# Implementation Plan: VS Code Extension — Thin Bridge

**Branch**: `004-vscode-extension-bridge` | **Date**: 2026-06-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-vscode-extension-bridge/spec.md`

## Summary

Add a thin VS Code extension that closes the analyze→inspect loop inside the IDE. The extension triggers analysis by spawning the existing `ppi analyze` CLI (with a new `--json` progress stream), shows live progress and completion/error in the editor, and renders the **existing** React/Mantine dashboard inside a Webview panel. Per decision C from clarify, no FastAPI server is started for the panel: the Webview hosts the same frontend bundle and obtains results through a message bridge. To keep the extension a true thin client (no DuckDB access, no analysis logic) while avoiding per-request process startup, the bridge is backed by a long-lived read-only CLI query process speaking JSON-RPC over stdio (`ppi rpc`). A shared query dispatcher (extracted from the server, FastAPI-free) gives byte-for-behavior parity between `ppi serve` and `ppi rpc`. Basic cancel terminates the spawned CLI process. A per-workspace profile/interpreter/results-dir configuration drives how the workspace is analyzed.

## Technical Context

**Language/Version**: Python 3.11+ (CLI side); TypeScript 5.x + VS Code Extension API (extension side); existing React 18 + Mantine 7 + Vite frontend reused in the Webview.

**Primary Dependencies**:
- Existing (Python): `click`, `duckdb`, `msgspec`, `pydantic`, `fastapi`/`uvicorn` (server only), `rich`, `anyio`, `Expression`, `toolz`.
- Existing (frontend): `react`, `react-dom`, `@mantine/core`, `@mantine/charts`, `recharts`, `d3-force`, `d3-hierarchy`, `i18next`, `vite`.
- New (extension): `@types/vscode` (^1.100.0) + `@types/vscode-webview` (webview `acquireVsCodeApi` typing), `esbuild` (bundle extension + Webview entry), `@vscode/vsce` (package/publish to `.vsix`; requires Node >= 22), `@vscode/test-electron` (integration tests), `vitest` (optional unit tests).

**Storage**: existing per-workspace DuckDB file owned by the CLI/worker. The extension MUST NOT open or write it directly (FR-015, Principle V). Reads flow through the CLI (`ppi rpc`); writes flow through `ppi analyze`.

**Testing**: `pytest` for Python (`tests/unit`, `tests/contract`, `tests/integration`); for the shared query dispatcher — contract tests asserting `ppi rpc` and `ppi serve` return equivalent JSON for the same request; for the extension — `@vscode/test-electron` integration tests + unit tests for the stdio bridge and progress parser; frontend `DataSource` adapter unit tests (vitest).

**Target Platform**: VS Code desktop Extension Host; fully local, single-user, single workspace per panel.

**Project Type**: VS Code extension (TypeScript) + incremental Python CLI/runtime changes. New top-level package directory `vscode-extension/`; the Python package `ppi` gains two new run modes (`analyze --json`, `ppi rpc`) and a FastAPI-free shared query dispatcher.

**Performance Goals**: progress event visible to analyst ≤ 2 s after emission (SC-005); Webview request/response latency low enough for fluid dashboard use — achieved by a **persistent** stdio RPC process (no per-request Python startup); `ppi rpc` cold-open of the DuckDB store happens once per panel session.

**Constraints**: fully local (no cloud/Postgres/Docker); thin client — extension must not own analysis or storage (FR-015, Principle IV/V); no HTTP server for the panel (decision C); reuse the existing frontend bundle, do not reimplement the dashboard (FR-007/SC-003); preserve core independence (Principle II — no VS Code/transport imports in Python core); typed contracts via `msgspec` (Principle VI).

**Scale/Scope**: one workspace, local Git repos; one active analysis run per workspace (FR-006); one `ppi rpc` servant per open dashboard panel.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How the design honors it |
|-----------|--------|--------------------------|
| I. Functional core, OO shell | PASS | The shared query dispatcher is pure functions over `StoreReader` results (`(reader, params) -> dict`); the stdio RPC loop and `analyze --json` emission are runtime shell. No domain logic in the extension. |
| II. Layered core independence | PASS | Python core gains no VS Code/IDE/transport/HTTP imports. The shared dispatcher lives in a new FastAPI-free `ppi.query` package depending only on `ppi.storage`; `ppi.server.api` and the CLI both import it. The TypeScript extension is an external client. |
| III. Plugin extensibility | PASS | No plugins added this stage. The query surface stays generic over the existing registry/StoreReader; new profiles/metrics added later flow through automatically. |
| IV. CLI-first, multi-interface clients | PASS | The CLI is the canonical query interface: the Webview reaches data through `ppi rpc` (a CLI run mode), not a private server. `ppi serve` remains an optional HTTP adapter over the same dispatcher. The extension is an optional client. |
| V. Single-writer data ownership | PASS | The extension never writes DuckDB. `ppi analyze` retains the existing writer lock and single-writer path. `ppi rpc` is strictly read-only. Cancel terminates the CLI process; no result rollback (deferred to Stage 7 worker). |
| VI. Typed contracts & explicit error handling | PASS | `analyze --json` events and `ppi rpc` messages are `msgspec` structs; fallible CLI ops return `Result`; the bridge surfaces errors as typed `RpcError`/`RunFailed` rather than exceptions. |

**Gate result**: PASS — no violations to justify. Complexity Tracking table left empty.

## Spec Refinements (Audit Follow-up 2026-06-22)

An independent read-only requirements-quality audit closed these gaps directly in `spec.md` (no plan change required, recorded here for traceability): FR-014 fixed executable resolution precedence; FR-019 added terminal-event semantics + `--json` progressbar suppression; FR-020 added post-cancel stale-lock recovery; new FR-021 (schema-incompatible store -> prompt rebuild), FR-022 (Webview message correlation), FR-023 (one long-lived read-only query process per panel, no per-request spawn), FR-024 (read-only servant, no writer lock, no writes); new SC-008 (persistent-process verifiability); and the stale `ppi query --format json` assumption was replaced by the `ppi rpc` read-only servant. The design above already implements these (R1 persistent `ppi rpc`, R5 cancel+stale-lock via `doctor`, R8 schema-incompatible handling).


## Project Structure

### Documentation (this feature)

```text
specs/004-vscode-extension-bridge/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── analyze-json-progress.md
│   ├── query-rpc.md
│   ├── webview-bridge.md
│   ├── cli-query-surface.md
│   └── extension-manifest.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
vscode-extension/                 # NEW — VS Code extension (TypeScript)
├── package.json                  # extension manifest: commands, activation, configuration
├── tsconfig.json
├── esbuild.mjs                   # bundles extension host code + webview entry
├── .vscodeignore
├── README.md
├── src/
│   ├── extension.ts              # activate(), command registration, run manager
│   ├── analyzeRunner.ts          # spawn `ppi analyze --json`, parse progress stream, cancel
│   ├── queryBridge.ts            # spawn/own `ppi rpc` servant; JSON-RPC request/response
│   ├── webviewPanel.ts           # WebviewPanel lifecycle, CSP, HTML, message routing
│   ├── settings.ts               # profile / analysisDir / interpreter resolution + precedence
│   ├── env.ts                    # resolve `ppi` executable (configured interpreter or PATH)
│   ├── contracts.ts              # TS mirror of Python msgspec contracts
│   └── status.ts                 # status-bar + notifications for progress/completion/error
├── webview/
│   └── index.ts                  # acquireVsCodeApi(), wire WebviewDataSource, bootstrap App
├── media/
│   └── icon.png
└── test/
    ├── runTest.ts                # @vscode/test-electron runner
    └── unit/

frontend/
├── src/
│   ├── api/
│   │   ├── client.ts             # refactored: fetch* helpers delegate to a DataSource
│   │   └── dataSource.ts         # NEW: DataSource interface + HttpDataSource + WebviewDataSource
│   ├── main.tsx                  # browser bootstrap → HttpDataSource
│   └── webview-main.tsx          # NEW: webview bootstrap → WebviewDataSource (reuses App)
├── vite.config.ts                # add webview build target → dist-webview/
└── package.json

src/ppi/
├── cli/
│   └── main.py                   # add `analyze --json`; add `rpc` command (stdio JSON-RPC)
├── query/                        # NEW — FastAPI-free shared query dispatcher
│   ├── __init__.py
│   ├── dispatch.py               # (endpoint, params) -> StoreReader call -> dict/list
│   └── contracts.py              # msgspec structs: RpcRequest, RpcResponse, RpcError
├── runtime/
│   └── progress.py               # NEW: msgspec ProgressEvent structs + JSON-lines emitter
└── server/
    └── api.py                    # refactored: delegate to ppi.query.dispatch (no behavior change)

tests/
├── contract/
│   ├── test_query_dispatch_parity.py   # ppi rpc vs ppi serve equivalence
│   └── test_analyze_json_progress.py
├── integration/
│   └── test_rpc_stdio.py
└── unit/
    └── test_progress_events.py
```

**Structure Decision**: A new self-contained `vscode-extension/` directory holds the TypeScript extension and its own npm project (separate from the Python package and the browser frontend), so Python packaging is unaffected and the extension can be built/packed with `vsce` independently. The existing `frontend/` gains a thin `DataSource` abstraction and a second Vite entry (`webview-main.tsx`) that reuses the same `App` — this is the only frontend change and keeps SC-003 parity by construction. On the Python side, a new FastAPI-free `ppi.query` package holds the shared dispatcher used by both `ppi serve` and the new `ppi rpc` stdio mode; `ppi.runtime.progress` holds the `analyze --json` event contracts. This keeps the core independent (Principle II) and the CLI the canonical query surface (Principle IV).

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.
