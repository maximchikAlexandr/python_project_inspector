# CLI Contract: `ppi`

Console command and import package rename from `python_project_inspector` to `ppi`. README product name and git repo name are preserved. PyPI distribution name becomes `ppi`.

## Invocation

```text
ppi --repo <path> [--branch <name>] [--profile odoo] [--analysis-dir <path>] [-v] <command> ...
```

- Old entry point `python-project-inspector` / `python_project_inspector.cli.main:cli` no longer exists; only `ppi` is installed (FR-034: no reachable old import path or console script).
- `pyproject.toml`: `name = "ppi"`, `[project.scripts] ppi = "ppi.cli.main:cli"`, hatch `packages = ["src/ppi"]`.

## Artifact placement

- DuckDB store: `<repo>/.ppi/history.duckdb` (in-project). On first creation, `<repo>/.ppi/.gitignore` is written with a single line `*`.
- Worktree, write lock, runtime metadata: user-level analysis dir (`~/.local/share/ppi/<project_id>/` or `--analysis-dir`). `assert_outside_repo` still guards these; relaxed only for the store path.

## Commands

### `analyze` (extended)

New scope options threaded into `build_report_config(...)`:

```text
--module-prefix <p>     repeatable; include modules whose name starts with <p>
--include-module <m>    repeatable; include exact module names
--all-modules           include every discovered module (default when no scope given)
--rebuild               drop stored project data and re-analyze (also clears v2 tables)
--jsonl <path>          optional JSONL dump of batches
--addons-path <rel>     repeatable addons root (existing)
```

Behavior: resolved scope is persisted (`AnalysisScope`). Incremental re-run with a different scope is rejected with a clear message (parallel to existing branch/profile checks); `--rebuild` is required to change scope. Default with no scope flags = all modules.

### `query` (extended)

`--metric` choices extended; output `--format table|json|csv` unchanged. All new reads are commit-scoped via `--commit <hash>` (defaults to latest).

```text
--metric complexity|lines|edges        (existing; lines/complexity gain --agg)
--metric modules                       snapshot: all module rows at --commit
--metric files                         snapshot: file rows at --commit (optionally --module)
--metric module-detail --module M      one module snapshot incl. declared/inherited models, depends
--metric file-detail --file M/rel      one file snapshot (incl. top_folder)
--metric graph                         nodes + edges + breakdown at --commit
--metric edge-points --source S --target T   edge breakdown + evidence rows
--metric edge-evidence --source S --target T   evidence rows only
--metric models --module M             declared/inherited model names
--metric depends [--module M]          in-scope manifest dependencies
--metric lines-by-category --module M  per-category line series over history
--metric file-count --module M         python_file_count series over history
--metric edge-kinds [--kind K]         edge-kind count series over history
--metric relations-diff --commit A --commit-b B   added/removed relations between commits

--commit <hash>        snapshot/diff selector (default: latest)
--agg mean|median|p95|max   for complexity/hotspot reads (default mean)
--include-zero-score   include score==0 edges in graph/edge reads
--source / --target    edge selectors
--module / --file      entity selectors (mutually exclusive where applicable)
```

Validation: unknown module/file/commit → `ClickException` with a clear message; `--source/--target` required for `edge-points`; `--commit-b` required for `relations-diff`.

### `serve` / `doctor` (unchanged behavior, new checks)

- `serve` continues read-only; reads the in-project `.ppi/history.duckdb`.
- `doctor` adds a `.ppi` writability check and warns when `.ppi/` (or `history.duckdb`) is tracked in Git despite the self-ignoring `.gitignore`.

## Exit codes & errors

- `0` success; non-zero on `ClickException` (unknown entity/commit, scope conflict, schema incompatibility, store not found).
- Schema mismatch (v1 store) → message instructing `analyze --rebuild`.
