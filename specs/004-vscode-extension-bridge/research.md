# Research: VS Code Extension — Thin Bridge

**Date**: 2026-06-22 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Phase 0 research resolves the open technical questions surfaced during clarify and planning, grounded in the existing codebase and the referenced VS Code Extension documentation/examples.

## Codebase findings (investigated this session)

- `ppi analyze` (`src/ppi/cli/main.py`) walks non-merge commits inside a `click.progressbar`, writes structured `RunMeta` (status, `commits_total`/`commits_succeeded`/`commits_failed`, started/finished) to DuckDB via `StoreWriter`, and optionally writes per-batch JSONL with `--jsonl`. There is **no** machine-readable progress stream on stdout today.
- `ppi query` exposes a subset of reads (`complexity`, `lines`, `edges`, `modules`, `files`, `module-detail`, `file-detail`, `graph`, `edge-points`, `edge-evidence`, `models`, `depends`, `lines-by-category`, `file-count`, `edge-kinds`, `relations-diff`, `failures`) as `table`/`json`/`csv`.
- `ppi serve` (`src/ppi/server/app.py` + `api.py`) mounts a FastAPI router at `/api` over a `StoreReader`; endpoints: `status`, `commits`, `catalog`, `metrics/timeseries`, `hotspots`, `structure/timeseries`, `edges`, `snapshot/modules`, `snapshot/files`, `snapshot/module/{name}`, `snapshot/file`, `graph`, `edge-points`, `edge-points/batch` (POST), `edge-evidence`, `models`, `depends`, `failures`, `edge-kinds/timeseries`, `relations/diff`.
- The frontend (`frontend/src/api/client.ts`) reads everything via one helper `fetchJson(path)` calling `fetch("/api/...")` with relative paths. This single choke point is the integration seam for the Webview transport.
- `StoreReader` (`src/ppi/storage/queries.py`) already implements every read the server exposes. The server is a thin HTTP wrapper over `StoreReader`; `ppi query` wraps a subset.
- `ppi doctor` exists for environment checks; the writer lock (`runtime/lock`) and per-repo `store_path`/`project_id_from_repo` already bind results to a repo path.

**Implication**: parity between browser and Webview is achievable without a server if the Webview's data source routes to the **same `StoreReader` calls** the server makes. The gap is that `ppi query` does not expose all endpoints; closing it is wiring, not new domain logic.

## R1 — How the Webview obtains results without a server (decision C)

**Decision**: A **persistent read-only CLI query process over stdio JSON-RPC** (`ppi rpc`) backs the Webview. The extension spawns one `ppi rpc` servant per open dashboard panel, keeps it alive for the panel lifetime, and bridges frontend `/api`-style requests (sent from the Webview via `postMessage`) into JSON-RPC requests on the servant's stdin; responses come back on stdout and are posted to the Webview. A shared dispatcher (`ppi.query.dispatch`) maps each request to the same `StoreReader` call used by `ppi serve`, so behavior is identical.

**Rationale**:
- Honors decision C: no HTTP server, results delivered via the message bridge (postMessage → extension → stdio → CLI).
- Keeps the extension thin (FR-015, Principle V): the extension never opens DuckDB; it only shuttles messages and owns process lifecycle. All reads/writes stay in the CLI.
- Avoids per-request process startup: the dashboard issues many requests on load and on each interaction (graph explorer clicks → `edge-points`/`edge-evidence`; `relations/diff` between arbitrary commits). Spawning a fresh `ppi` per request would pay Python+DuckDB cold-open each time — unacceptable UX and would blow the SC-005 spirit for result rendering.
- Gives parity by construction (SC-002/SC-003): server and `ppi rpc` share one dispatcher, so an interaction that works in the browser works in the panel.
- Aligns with Principle IV (CLI-first): the CLI is the query interface; `ppi serve` becomes an optional HTTP adapter over the same dispatcher.
- Read-only servant is **not** the Stage 7 worker: no analysis ownership, no DuckDB writes, no runtime metadata/socket, extension-owned lifecycle. It does not preempt single-writer concerns.

**Alternatives considered**:
- **Per-request `ppi query --format json` spawn** (the spec's literal assumption): rejected — repeated Python/DuckDB startup makes the dashboard sluggish; also requires `ppi query` to cover every endpoint.
- **One-shot snapshot export dumped once via postMessage**: rejected — the dashboard is interactive (arbitrary `edge-points`/`edge-evidence`/`relations/diff` on demand); a static snapshot cannot cover arbitrary on-demand combos without dumping everything (all edge pairs × commits), which is huge and stale.
- **Start `ppi serve` and load it in the Webview** (decision A): rejected by the user in clarify (decision C: no server).
- **Extension reads DuckDB directly**: rejected — violates FR-015/Principle V (thin client, no storage ownership) and couples the TypeScript extension to DuckDB/Python schema.
- **Shared dispatcher living in `ppi.server`**: rejected — `ppi.server.api` imports FastAPI at module top; importing it from the CLI would pull FastAPI into the CLI path. The dispatcher is placed in a new FastAPI-free `ppi.query` package depending only on `ppi.storage`.

**Note on the spec assumption**: the spec's assumption named `ppi query ... --format json` as the mechanism. This plan refines the *mechanism* to a persistent `ppi rpc` servant while staying within the spec's intent ("existing CLI query/export path", thin, no server). No spec change required; documented here as the plan-level realization.

## R2 — The `analyze --json` progress contract (FR-019)

**Decision**: Add a `--json` flag to `ppi analyze`. When set, the command emits newline-delimited JSON events on stdout and suppresses the human `click.progressbar`. Events are `msgspec` structs (`ppi.runtime.progress`): `RunStarted` (run_id, branch, mode, commits_total), `CommitProgress` (processed, commits_total, short_hash, phase), `RunCompleted` (run_id, commits_succeeded, commits_failed, duration_ms), `RunFailed` (run_id, exit_reason, message, stderr_tail). The final summary line printed today is folded into `RunCompleted`. `--jsonl` (batch file) remains orthogonal and unchanged.

**Rationale**: reuses the existing `RunMeta` fields and the loop's existing counters; the only change is *output formatting* gated by a flag — analysis logic is untouched (FR-019 "MUST NOT alter analysis logic"). JSON-lines is trivially stream-parsed by the extension's `analyzeRunner`. Non-`--json` runs keep today's terminal output bit-for-bit.

**Alternatives**:
- Polling a status file written by the CLI: rejected — extra filesystem contract, coarser, and the CLI already streams progress internally to the bar.
- Exit-only status (no live progress): rejected — violates SC-005/FR-002.

## R3 — The shared query dispatcher and `ppi rpc` protocol

**Decision**: Extract the server's endpoint-to-`StoreReader` mapping into `ppi.query.dispatch` as pure functions `(reader, endpoint, params) -> dict | list`, parameterized by an explicit endpoint id (mirroring the `/api` path) and a params dict. `ppi.server.api` is refactored to call `ppi.query.dispatch` (no behavior change, verified by existing server tests). A new `ppi rpc` command runs a long-lived read-only JSON-RPC loop over stdin/stdout using the same dispatcher. The endpoint id set and param shapes are documented in `contracts/cli-query-surface.md` (the 1:1 map from dashboard `/api` path → RPC method → `StoreReader` call).

**Rationale**: one dispatcher = parity between `ppi serve` and `ppi rpc` (SC-003), and a single place to maintain the query surface. Keeps FastAPI out of the CLI. The dispatcher is an adapter over `StoreReader`, not core domain logic (Principle II).

**Alternatives**:
- Duplicate the endpoint logic in the CLI: rejected — divergence risk, parity breaks.
- Make `ppi rpc` import `ppi.server.api`: rejected — pulls FastAPI into the CLI.

**Endpoint coverage gap to close** (endpoints the dashboard uses that `ppi query` does not yet expose; `ppi rpc` will expose all of them via the dispatcher): `status`, `commits`, `catalog`, `metrics/timeseries`, `hotspots`, `structure/timeseries`, `snapshot/modules`, `snapshot/files`. (`edges`, `graph`, `edge-points`, `edge-evidence`, `models`, `depends`, `failures`, `edge-kinds/timeseries`, `relations/diff`, `snapshot/module`, `snapshot/file` already have `StoreReader` methods and mostly existing `ppi query` metrics.)

## R4 — Frontend transport abstraction (FR-018 / SC-003)

**Decision**: Introduce a `DataSource` interface in `frontend/src/api/dataSource.ts` with `get<T>(path, params?): Promise<T>` and `post<T>(path, body): Promise<T>`. `HttpDataSource` wraps the existing `fetch` (browser). `WebviewDataSource` serializes a request, posts it to the extension via `acquireVsCodeApi().postMessage`, and awaits the matching response by correlation id. All `fetch*` helpers in `client.ts` delegate to an injectable `DataSource` set at bootstrap (`main.tsx` → `HttpDataSource`; new `webview-main.tsx` → `WebviewDataSource`). `webview-main.tsx` imports the **same** `App` and pages — no dashboard reimplementation.

**Rationale**: one choke point (`fetchJson`) makes the change small and keeps parity (the same components, the same data shapes). The Webview entry is a thin bootstrap difference, exactly the "results-ingest adapter" the spec allows (FR-018).

**Alternatives**:
- Fork the frontend for the Webview: rejected — breaks SC-003 and doubles maintenance.
- Inject a `fetch` shim that intercepts `/api` in the Webview: feasible but opaque; an explicit `DataSource` is clearer and testable.

## R5 — VS Code extension mechanics (from referenced docs/examples)

Grounded in the VS Code Webview guide, extension manifest reference, Extension Host docs, `microsoft/vscode-extension-samples` (`webview-sample`), and `vscode-vsce`:

- **WebviewPanel**: create with `vscode.window.createWebviewPanel(id, title, column, { enableScripts: true, localResourceRoots: [...], retainContextWhenHidden: false })`. Load HTML that references the built `dist-webview` assets via `webview.asWebviewUri(...)`. The panel is dockable into any view column (FR-009) and survives move; state is reloaded on reopen (FR-009 acceptance 4) — keep `retainContextWhenHidden: false` and re-bootstrap on `onDidChangeViewState`/reveal.
- **Messaging**: the Webview calls `acquireVsCodeApi()` once (guard against double-acquire) and uses `postMessage`/`onDidReceiveMessage`. The extension listens on `panel.webview.onDidReceiveMessage` and routes request/response/progress/cancel messages (see `contracts/webview-bridge.md`).
- **Content Security Policy**: set a strict CSP meta tag allowing only `vscode-resource:`/`https:` as needed, with nonces for inline scripts if any; the built bundle is loaded as external script resources via `webview.asWebviewUri`. No remote code.
- **Manifest (`package.json`)**: `engines.vscode`, `main` (bundled `dist/extension.js`), `activationEvents: onStartupFinished` (or `onCommand` for the three commands), `contributes.commands` (`ppi.analyze`, `ppi.openDashboard`, `ppi.cancelAnalysis`), `contributes.configuration` (`ppi.profile` enum `["python","odoo"]` default `python`; `ppi.analysisDir`; `ppi.pythonExecutable`; `ppi.cliPath`). See `contracts/extension-manifest.md`.
- **CLI resolution**: prefer `ppi.pythonExecutable` (run `python -m ppi` or the package console script) else `ppi.cliPath` else the `ppi` console script on PATH; surface a readable error + "open settings" action if not found (FR-014). Resolution lives in `env.ts`.
- **Process ownership**: `analyzeRunner` spawns `ppi analyze --json`, streams stdout line-by-line, maps events to status-bar/notifications (FR-002/FR-003/FR-004), and on cancel sends `SIGTERM` (then `SIGKILL` fallback) and reports `cancelled` (FR-020). `queryBridge` spawns `ppi rpc`, owns its stdin/stdout, and tears it down on panel dispose.

**Doc verification (2026-06-22)**: Cross-checked against the live sources — VS Code Webview guide, extension manifest reference, Extension Host docs, `microsoft/vscode-extension-samples/webview-sample` (package.json/extension.ts/tsconfig/README), and `microsoft/vscode-vsce` README. Corrections applied to `contracts/extension-manifest.md` and `contracts/webview-bridge.md`: (1) CSP must use the dynamic `webview.cspSource` + per-load nonce, NOT the deprecated literal `vscode-resource:` scheme (webview-sample uses `default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'`); (2) `engines.vscode` and `@types/vscode` bumped to `^1.100.0` (sample baseline) with `@types/node` ^22 (vsce requires Node >= 22); (3) added `@types/vscode-webview` for `acquireVsCodeApi` typing in the webview; (4) added `license`/`repository` fields + `@vscode/vsce` requirements (Node 22, LICENSE/README/repository mandatory, `VSCE_STORE=file`/`VSCE_PAT` for publish); (5) `localResourceRoots` restricted to the built `dist-webview`+`media`. Bundling via esbuild is retained (the sample uses `tsc` to `out/`; esbuild is an equally valid bundling choice for `vsce`).
- **Packaging/publishing (`vsce`)**: `vsce package` builds a `.vsix` (run `esbuild` in `vscode:prepublish`); local install via `code --install-extension ./ppi-<ver>.vsix`; publish via `vsce publish <pat>`. `.vscodeignore` excludes `src`, `test`, `node_modules`, and the Python/frontend sources from the package; the built `dist`/`dist-webview` and `media` are included.

## R6 — Multi-folder and workspace identity (FR-017)

**Decision**: When the editor has one workspace folder, it is the analysis root passed to the CLI (which already derives `store_path`/`project_id` from the repo path). When multiple folders are open, the `ppi.analyze`/`ppi.openDashboard` commands prompt a QuickPick to select the target folder (defaulting to the first), and the chosen folder is shown in the status bar. The extension never invents its own workspace id; identity is the folder path, and the CLI owns project binding.

**Rationale**: reuses the existing CLI project binding; avoids a parallel registry (which belongs to Stage 9). FR-017's "select or indicate primary" is satisfied by QuickPick + status-bar label.

## R7 — Settings precedence and profile (FR-011/FR-012/FR-013)

**Decision**: Use VS Code's standard configuration scopes. `ppi.profile` and `ppi.analysisDir` are configurable at both Workspace and Global scope; VS Code's native workspace-over-global resolution provides FR-012 precedence for free. The CLI is invoked with `--profile` and the resolved analysis dir; when `ppi.analysisDir` is empty, the CLI's default analysis dir for the repo is used. Profile switch requires a re-run (matches SC-004); the extension warns if results exist for a different profile (the CLI already errors on profile change without `--rebuild`).

## R8 — Failure, empty, and stale states (FR-004/FR-005/FR-010, edge cases)

**Decision**: 
- CLI not found → error notification with "Open Settings" action (FR-014).
- No workspace folder → command shows an information message and aborts (FR-005).
- Run already in progress → status bar shows the active run; re-invoking `ppi.analyze` offers cancel (FR-006/FR-020) rather than a second spawn.
- Run failure → `RunFailed` event → error notification with the failing `stderr_tail` and a "Retry" action (FR-004/SC-006).
- No completed results → the dashboard `WebviewDataSource` `status` request returns `store_present:false`/`schema_compatible:false`; the Webview shows the existing empty state plus a "Run analysis" button that posts a command message back to the extension (FR-010).
- Stale/incompatible store → `status` reports `schema_compatible:false`; the panel prompts a re-run with `--rebuild`.
- Editor reload mid-run → best-effort: the orphaned CLI may continue; on next activation the extension checks the writer lock via `ppi doctor`/`status` and reports an apparently incomplete run (assumption, Stage 7 owns robust supervision).

## Resolved NEEDS CLARIFICATION

All `NEEDS CLARIFICATION` markers from Technical Context are resolved above: transport (R1), progress (R2), query surface/parity (R3), frontend adapter (R4), extension mechanics (R5), multi-folder (R6), settings (R7), failure/empty/stale (R8). No markers remain.
