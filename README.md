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
