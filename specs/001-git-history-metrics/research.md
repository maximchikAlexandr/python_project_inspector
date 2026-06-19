# Phase 0 Research: Git History Metrics Pipeline (MVP Stages 1-4)

All Technical Context items were resolvable from the project constitution and `.devlocal/architecture.md`; no `NEEDS CLARIFICATION` markers remain. This file records the non-obvious design decisions and the rationale behind them.

## 1. Commit traversal (non-merge, oldest→newest, streamed)

- **Decision**: Enumerate commits with `git rev-list --no-merges --reverse --first-parent=false <branch>` (i.e., `--no-merges --reverse <branch>`), iterating the resulting hashes one at a time. Resolve commit identity (hash, author, author/commit timestamps) via `git show -s --format=...` or a single `git log` pass cached per commit.
- **Rationale**: Matches the clarified scope (non-merge only, chronological from root to tip). `--reverse` yields oldest→newest; streaming the hash list keeps memory flat regardless of history length (Edge Case: very large history).
- **Alternatives considered**: `pygit2`/`GitPython` libraries (extra dependency and abstraction over the same plumbing; the `git` CLI is already required for worktrees, so reuse it); `--first-parent` linear history (rejected by clarification in favor of all non-merge commits).

## 2. Isolated, silent worktree checkout

- **Decision**: Create one `git worktree add --detach <worktree_dir> <branch_tip>` per run in the runtime/analysis directory (outside the analyzed repo's tracked tree), then move through commits with `git -C <worktree_dir> checkout --detach --quiet <hash>` (also `-f` to discard any residue). All git invocations capture stdout/stderr (not inherited), so checkout output never reaches the user. Remove the worktree with `git worktree remove --force` on completion/cancel/failure; prune stale worktrees with `git worktree prune` and recover leftovers by name.
- **Rationale**: A detached worktree fully isolates checkouts from the user's working tree, branch, and uncommitted changes (FR-003, SC-002). Capturing git output satisfies "checkout invisible to the user" (FR-006). A deterministic worktree path enables stale-worktree recovery (Edge Case).
- **Alternatives considered**: `git stash` + in-place checkout on the user's tree (rejected: violates FR-003, risks user data); `git archive`/extract per commit (slower, loses incremental checkout speed, more temp I/O); reading blobs via `git cat-file` without checkout (the existing analyzer expects a real directory tree of modules, so a worktree is the lowest-friction reuse path).

## 3. Reuse of the existing analyzer behind a fact contract

- **Decision**: Keep the existing pure analysis functions from `report.py` (module discovery, size/line counts, radon cyclomatic, complexipy cognitive, "jones" AST density, coupling edges) and wrap them in `core/analyzer.py` as a single built-in provider: `analyze_worktree(path, profile_config) -> Result[AnalysisBatch]`. The batch carries per-file metrics, per-module aggregates, and coupling edges as `msgspec` structs.
- **Rationale**: Honors "reuse existing metrics unchanged" (FR-002) and "store everything the analyzer produces" (FR-011) while introducing the typed seam that the future pluggy registry (stage 10) will slot into without rewrites.
- **Alternatives considered**: Calling `report.py` as a subprocess and parsing its JSON (brittle, slower, double-parsing); rewriting metrics now (rejected — clarified as unchanged reuse).

## 4. DuckDB store, single writer, read-only serve/query

- **Decision**: One DuckDB file per project. `analyze` opens it read-write under a per-project file lock; `query` and `serve` open it with `read_only=True`. Writes are batched per commit inside a transaction by `storage/writer.py` (the sole writer).
- **Rationale**: DuckDB permits one read-write process or multiple read-only processes against a file; a single-writer lock plus read-only readers satisfies Principle V without a worker. Per-commit transactions bound memory and make interrupted runs resumable (only fully-committed commits are considered "stored").
- **Concurrency note**: DuckDB does not support cross-process reads concurrent with an active external writer on the same file. For the MVP, `serve`/`query` are expected to run against a store that is not being written at that moment; if a writer holds the lock, readers report "analysis in progress" rather than corrupting or blocking indefinitely. The future worker (stage 7) will mediate concurrent read/write centrally.
- **Alternatives considered**: SQLite (weaker analytical/columnar querying for time-series aggregates; architecture mandates DuckDB); a long-lived worker now (deferred, see plan Complexity Tracking).

## 5. Incremental re-analysis (skip already-stored commits)

- **Decision**: Before walking, read the set of already-stored commit hashes for the project from the store. Skip any commit already present; analyze and write only new ones. A `--rebuild` flag drops/recreates project data for a full re-run.
- **Rationale**: Implements FR-015 (incremental default, rebuild on demand) and keeps re-runs cheap. Commit hashes are immutable identifiers, so "already stored" is unambiguous and idempotent (SC-007).
- **Alternatives considered**: Timestamp/high-water-mark tracking (fragile with non-linear history); always full rebuild (rejected by clarification).

## 6. Progress reporting without checkout noise

- **Decision**: Use `click`'s progress bar (`click.progressbar`) driven by the walker, with total = count of non-merge commits to analyze (after the incremental skip filter) and label = short hash/summary of the current commit. Git subprocess output is captured, so only the progress bar and a final success/failure summary appear.
- **Rationale**: Satisfies FR-005 (progress bar for a long run) and FR-006 (hidden checkout) using the already-required `click` dependency.
- **Alternatives considered**: `rich`/`tqdm` (extra dependency; `click` already in stack); plain log lines per commit (noisy, conflicts with "hidden checkout" intent).

## 7. Failure isolation and run accounting

- **Decision**: Wrap per-commit and per-file analysis in `Result`; on failure, persist a `FailureRecord` (commit hash, optional file path, error text) and continue. The run summary reports counts of succeeded vs. failed commits.
- **Rationale**: Implements FR-007 and SC-006; aligns with Principle VI (no exceptions across domain boundaries).

## 8. Path & artifact placement

- **Decision**: `runtime/paths.py` resolves a per-project analysis directory outside the analyzed repo (default under a user data/runtime dir keyed by repo path; overridable via CLI/config). The DuckDB file, worktree, lock, and run metadata live there.
- **Rationale**: Implements FR-027 and SC-008 (no artifacts inside the analyzed repo, no accidental commits) and the architecture note on short runtime paths to avoid path-length issues.

## 9. Schema versioning & migration

- **Decision**: Store a `schema_version` value in a `meta` table. On open, compare against the package's `SCHEMA_VERSION`; on mismatch, surface a clear message (and, where safe, run forward migrations). For the MVP, an incompatible older store is reported and the user is directed to `--rebuild`.
- **Rationale**: Implements FR-013/FR-014; keeps MVP migration minimal while making versioning explicit.

## 10. Packaging & CLI

- **Decision**: `pyproject.toml` with a console-script entry point exposing the `click` group (`analyze`/`query`/`serve`/`doctor`), managed/run via `uv`. `doctor` checks git availability, repo/branch validity, analysis-dir writability, store accessibility, and stale lock/worktree state.
- **Rationale**: Implements FR-021..FR-025 and the constitution's CLI-first, uv/PyPI distribution constraints.
