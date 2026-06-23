# Quickstart: VS Code Extension — Thin Bridge

**Date**: 2026-06-22 | **Plan**: [plan.md](plan.md) | **Contracts**: [contracts/](contracts)

This is a runnable validation guide for the feature. It proves the end-to-end loop works: install `ppi`, build the frontend Webview bundle, build/package the extension, run analysis from VS Code, and inspect results in the embedded dashboard. Implementation bodies and full tests live in `tasks.md`; this guide references contracts rather than duplicating them.

## Prerequisites

- Python 3.11+, `uv`, Git.
- Node 20+, npm.
- VS Code (desktop).
- The `ppi` package installed and on PATH (or a configured interpreter):
  ```
  uv sync
  uv pip install -e .
  ppi --help
  ```
- A target Python/Odoo Git repository to analyze.

## 1. Build the frontend (browser + Webview bundles)

The Webview reuses the same `App` via a second Vite entry. Both bundles are built from `frontend/`.

```
cd frontend
npm install
npm run build              # builds browser bundle → frontend/dist
npm run build:webview      # builds Webview entry (webview-main.tsx) → frontend/dist-webview
```

Validation: `frontend/dist/index.html` and `frontend/dist-webview/index.html` both exist; the Webview bundle references `acquireVsCodeApi` in its bootstrap.

## 2. Build and package the extension

```
cd vscode-extension
npm install
npm run build              # esbuild → dist/extension.js
npm run package            # vsce → ppi-vscode-0.1.0.vsix
code --install-extension ./ppi-vscode-0.1.0.vsix
```

Validation: `code --list-extensions` shows the extension; the Command Palette offers `PPI: Analyze Project`, `PPI: Open Dashboard`, `PPI: Cancel Analysis`.

## 3. Configure the workspace

Open a Python or Odoo project folder in VS Code. Open Settings:
- `ppi.profile`: `python` (default) or `odoo`.
- `ppi.pythonExecutable` or `ppi.cliPath`: only if `ppi` is not on PATH.

Validation: `PPI: Analyze Project` resolves the `ppi` executable without a "CLI not found" error (contract: `extension-manifest.md`).

## 4. Run analysis from the editor (Story 1)

1. Command Palette → `PPI: Analyze Project`.
2. (If multiple folders) pick the target in the QuickPick.
3. Watch the status bar: `PPI: analyzing main [7/412] a1b2c3d4`.
4. On completion: a notification `PPI: analysis completed (410 ok, 2 failed)` with a `View Dashboard` action.

Validation:
- A DuckDB store exists for the repo (`ppi doctor` reports `store readable`).
- Progress updates come from the `analyze --json` stream (contract: `analyze-json-progress.md`), not a static spinner (SC-005).
- On an induced failure (e.g. run in a non-Git folder), an error notification shows the failing output with a `Retry` action (SC-006).

## 5. Open the dashboard inside the editor (Story 2)

1. `PPI: Open Dashboard` (or the `View Dashboard` action from step 4).
2. A Webview panel renders the existing dashboard with the workspace's results.
3. Dock the panel into another view column; interactions (filters, graph explorer, commit navigation) work like the browser dashboard.

Validation:
- No `ppi serve` process is running (decision C): the panel is backed by a `ppi rpc` servant (`ps | grep "ppi rpc"` shows exactly one per open panel).
- Parity check: open the browser dashboard (`ppi serve --open` in a terminal) and the Webview side by side; `graph`, `snapshot/modules`, and `relations/diff` render identical data (SC-003). The contract test `tests/contract/test_query_dispatch_parity.py` asserts this at the JSON level.
- Empty state: delete the store, reopen the panel → an empty state with a `Run analysis` button appears (FR-010). Clicking it triggers `PPI: Analyze Project` via a `command` message (contract: `webview-bridge.md`).

## 6. Profile switch (Story 3)

1. Set `ppi.profile` = `odoo` for an Odoo workspace.
2. `PPI: Analyze Project`; confirm Odoo-specific entities/relations appear in the dashboard.
3. Set `ppi.profile` back to `python`; re-run; confirm plain-Python behavior returns.

Validation: switching profile triggers a re-run; the CLI errors on profile change without `--rebuild`, and the extension surfaces that with a re-run prompt (SC-004). Workspace setting overrides a conflicting global default (FR-012).

## 7. Cancel and edge cases (FR-006/FR-020)

1. Start a long analysis; `PPI: Cancel Analysis` → status becomes `cancelled`, the `ppi analyze` process is terminated.
2. Reload the VS Code window mid-run → on next activation the extension reports an apparently incomplete run (best-effort; no result rollback).
3. `PPI: Analyze Project` while a run is active → it offers cancel instead of spawning a second run.

## Automated checks

- Python: `uv run pytest tests/contract/test_query_dispatch_parity.py tests/contract/test_analyze_json_progress.py tests/integration/test_rpc_stdio.py -q`
- Extension: `cd vscode-extension && npm test` (@vscode/test-electron) + `vitest` unit tests for `analyzeRunner`, `queryBridge`, `settings`, `env`.
- Frontend: `cd frontend && npx vitest run` for `DataSource` adapter parity.

## Expected outcome

An analyst can go from "I want metrics" to inspecting graphs, top-N complexity, and commit history entirely inside VS Code, with the same dashboard as the browser, no HTTP server, and the CLI remaining the single owner of analysis and storage (SC-001/SC-007).
