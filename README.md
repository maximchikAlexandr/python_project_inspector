# Python Project Inspector

Analyze Git history metrics for Python/Odoo projects.

## Install

```bash
uv sync
```

## Commands

Global options (`--repo`, `--branch`, …) go **before** the subcommand:

```bash
uv run ppi \
  --repo /path/to/repo --branch dev \
  doctor

uv run ppi \
  --repo /path/to/repo --branch dev \
  analyze --all-modules

uv run ppi \
  --repo /path/to/repo --branch dev \
  doctor --recover-stale

uv run ppi \
  --repo /path/to/repo --branch dev \
  serve --open
```

## Dashboard frontend

Build the React/Mantine UI before `serve` (the server prefers `frontend/dist` when present):

```bash
cd frontend
npm install
npm run build
```

Dashboard tabs: **Report** (commit-scoped graph, treemap, detail panels, edge points, manifest depends, parse failures), **Dashboard** (complexity/lines/hotspots with aggregation), **Structure** (coupling edges with include-zero-score toggle), **Analytics** (line-category series, python file count, edge kinds, relations diff), **Status**.

Snapshot query examples:

```bash
uv run ppi --repo /path/to/repo query --metric modules --format json
uv run ppi --repo /path/to/repo query --metric graph --format json
uv run ppi --repo /path/to/repo query --metric edge-points --source mod_a --target mod_b --format json
uv run ppi --repo /path/to/repo query --metric failures --format json
```

For local UI development with API proxy:

```bash
uv run ppi --repo /path/to/repo --branch dev serve --port 8765
cd frontend && npm run dev
```

The DuckDB history store lives in `<repo>/.ppi/history.duckdb` (git-ignored). Worktree, lock files, and runtime metadata stay under `~/.local/share/ppi/` (or `--analysis-dir`).

## VS Code extension

A thin bridge extension lets you analyze a workspace and view the dashboard
inside VS Code (Stage 5). It spawns the `ppi` CLI (`analyze --json` for progress;
`rpc` for the read-only dashboard data) and hosts the existing React dashboard in
a Webview — no HTTP server is started for the panel.

Build the webview bundle and the extension:

```bash
cd frontend && npm install && npm run build:webview   # -> vscode-extension/dist-webview
cd ../vscode-extension && npm install && npm run build  # -> dist/extension.js
```

Package and install locally:

```bash
cd vscode-extension && npm run package   # -> ppi-vscode-0.1.0.vsix
code --install-extension ./ppi-vscode-0.1.0.vsix
```

Commands: `PPI: Analyze Project`, `PPI: Analyze Project (Rebuild)`, `PPI: Open
Dashboard`, `PPI: Cancel Analysis`. Settings: `ppi.profile`, `ppi.analysisDir`,
`ppi.pythonExecutable`, `ppi.cliPath` (workspace-over-global precedence).

Machine-readable progress stream and read-only JSON-RPC query surface:

```bash
uv run ppi --repo /path/to/repo analyze --json          # JSON-lines progress events
uv run ppi --repo /path/to/repo rpc                      # stdio JSON-RPC query servant
```
