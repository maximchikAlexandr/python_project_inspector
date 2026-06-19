# CLI Contract: `python-project-inspector`

Single console entry point exposing a `click` command group. Global options resolve a consistent project context across subcommands (FR-024/FR-025).

## Global options

| Option | Default | Meaning |
|--------|---------|---------|
| `--repo PATH` | required (or cwd) | Path to the target git repository. |
| `--branch NAME` | repo's current branch | Branch whose history is analyzed. |
| `--profile [odoo]` | `odoo` | Analysis profile (only `odoo` in MVP). |
| `--analysis-dir PATH` | per-project runtime dir | Where the store, worktree, lock, and run metadata live (kept out of the repo). |
| `-v/--verbose` | off | Extra diagnostics on stderr (never the hidden checkout output). |

## `analyze`

Run a full/incremental history analysis and persist results (FR-001..FR-015).

| Option | Default | Meaning |
|--------|---------|---------|
| `--rebuild` | off | Drop project data and re-analyze the whole history (else incremental skip). |
| `--addons-path PATH` | repo root | One or more roots to scan for modules within the checked-out worktree (repeatable). |

**Behavior**
- Resolves project context; acquires the per-project write lock (fails clearly if another writer holds it).
- Enumerates non-merge commits oldest→newest; in incremental mode skips commits already in the store.
- Creates an isolated worktree; checks out each commit silently; runs the analyzer; writes one transaction per commit.
- Shows a `click` progress bar (current/total + short hash); no checkout output is printed.
- On per-commit/file failure: records a `FailureRecord` and continues.
- Always cleans up (or marks reusable) the worktree and releases the lock.

**Exit codes**: `0` completed (even with some failed commits); `2` setup/usage error (bad repo/branch, lock held, unwritable analysis dir); `1` fatal run error.

**stdout (success, example)**
```
Analyzed 453/453 commits (succeeded: 451, failed: 2) in 3m12s
Store: ~/.local/share/python-project-inspector/<project>/history.duckdb
```

## `query`

Read metrics from the store without re-running analysis (FR-013).

| Option | Default | Meaning |
|--------|---------|---------|
| `--metric NAME` | required | e.g., `complexity`, `lines`, `edges`. |
| `--module NAME` | all | Filter to one module. |
| `--file PATH` | all | Filter to one file. |
| `--format [table\|json\|csv]` | `table` | Output format. |

Opens the store read-only. Returns rows ordered by `commit_order`. Example: `query --metric complexity --module sale_extended` → complexity-over-time rows.

## `serve`

Start the optional FastAPI server + dashboard (FR-016..FR-021).

| Option | Default | Meaning |
|--------|---------|---------|
| `--host` | `127.0.0.1` | Bind host. |
| `--port` | `8765` | Bind port. |
| `--open` | off | Open the dashboard in a browser. |

Opens the store read-only and serves the HTTP API in `contracts/http-api.md` plus the built frontend. Reports "analysis in progress" if a writer holds the lock.

## `doctor`

Verify environment prerequisites and report problems (FR-023, US4 scenario 5).

Checks: `git` availability and version; repo exists and `--branch` resolves; analysis dir is writable; store is openable and schema-compatible; presence of stale lock/worktree (and offer recovery). Exit `0` if all pass, `1` otherwise. Output is a checklist of `OK`/`FAIL` lines.
