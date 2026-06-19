# Feature Specification: Git History Metrics Pipeline (MVP Stages 1-4)

**Feature Branch**: `001-git-history-metrics`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "Plan a feature based on items 1-4 of `.devlocal/todo.md`, taking `.devlocal/business.md` and `.devlocal/architecture.md` into account. The script should work through a git worktree."

## Overview

Today the tool can only analyze a single working-tree snapshot of a project and emit a one-off coupling report. This feature turns it into a **history-aware analytics pipeline**: it walks the non-merge commits of a target project's branch from the first commit to the tip, runs the existing analyzer at each commit, persists the resulting metrics in a queryable analytical store, and lets a user explore how the project evolved through queries and a visual dashboard. The whole capability is delivered as an installable command-line product.

This specification covers the first four delivery stages of the roadmap (history walk → durable storage → reports/visualization → CLI packaging) as one coherent feature, sliced into incrementally layered user stories. The stories form a pipeline: User Story 1 is the independent MVP; later stories build on it (US2 persists US1's output, US4 packages the US1/US2 commands, US3 visualizes the US2 store). Each story is still independently *testable* via its own acceptance scenarios.

## Clarifications

### Session 2026-06-19

- Q: Which commits are traversed for per-commit analysis on the chosen branch? → A: All non-merge commits on the branch, ordered oldest→newest; merge commits are skipped.
- Q: Which analyzer output must be stored per commit? → A: Everything the existing analyzer produces — per-file metrics, per-module aggregates, and cross-module coupling edges — captured at every analyzed commit.
- Q: Default behavior on re-running analysis of an already-analyzed project? → A: Incremental — commits already stored are skipped and only new commits are analyzed (full rebuild available on demand).
- Q: Is the isolated git worktree always created? → A: Yes — a git worktree is created unconditionally for every run; the tool never analyzes via the user's working tree.
- Q: Should the user see the per-commit git checkouts? → A: No — checkouts are silent/hidden; the long-running CLI run surfaces a progress bar instead of checkout output.
- Q: Are metrics newly defined or reused? → A: Metrics collection already exists; this feature reuses the existing metrics unchanged and simply collects them at every commit.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Collect metrics across the full Git history (Priority: P1)

As a developer who owns a Python/Odoo project, I point the tool at a repository and a branch and get a per-commit, per-file record of the project's metrics for every commit from the first commit to the tip, without disturbing my current working tree.

**Why this priority**: This is the core value of the product and the minimum viable result. Everything else (storage, queries, dashboards) is built on top of the historical metrics produced here. It can ship and be useful on its own.

**Independent Test**: Run the analysis command against the example repository and confirm it produces an ordered history record containing, for each analyzed commit, the commit identity and the metrics for each analyzed file/module — while the developer's checked-out branch remains untouched.

**Acceptance Scenarios**:

1. **Given** a repository with a multi-commit history on a chosen branch, **When** the user starts a history analysis, **Then** the tool walks the branch's non-merge commits in chronological order from the first commit to the tip (skipping merge commits) and records metrics for each commit.
2. **Given** the repository currently has a different branch checked out with local changes, **When** a history analysis runs, **Then** the tool always checks out historical commits in an isolated git worktree and the user's original working tree, branch, and uncommitted changes are unaffected.
3. **Given** a long-running analysis in the CLI, **When** the analysis runs, **Then** the user sees a progress bar (commits processed / total, current commit), while the underlying per-commit git checkouts are not surfaced in the output.
4. **Given** a commit whose source fails to parse or analyze, **When** the tool processes it, **Then** the failure is recorded for that commit/file and the run continues with the remaining commits rather than aborting.
5. **Given** a completed run, **When** the user inspects the output, **Then** results are available in a documented, stable format keyed at least by `commit + file + metrics`.

---

### User Story 2 - Persist history into a durable, queryable store (Priority: P2)

As a developer analyzing a project repeatedly, I want the historical metrics stored in a durable per-project analytical store so I can run ad-hoc queries instead of re-parsing files or grepping raw output.

**Why this priority**: Durable, structured storage is the foundation for reporting, dashboards, and incremental re-runs. It removes reliance on ad-hoc output files and makes the data reusable.

**Independent Test**: Run an analysis that writes to the project's analytical store, then issue a query (e.g., complexity of a given module over time) and get correct rows back without re-running the analysis.

**Acceptance Scenarios**:

1. **Given** a completed history analysis, **When** results are persisted, **Then** the store contains records for commits, files within commits, per-file metrics, per-module aggregates, and cross-module coupling edges, with each project using its own separate store file.
2. **Given** a populated store, **When** the user runs a metric query (e.g., "complexity per commit for module X"), **Then** the tool returns the matching rows.
3. **Given** the same project is analyzed again, **When** results are written, **Then** writes go through a single owner of the store so the store cannot be corrupted by concurrent writers.
4. **Given** the store schema changes between versions, **When** the user opens an existing store, **Then** the tool reports the schema version clearly rather than failing silently or producing wrong results.

---

### User Story 3 - Explore history through reports and a dashboard (Priority: P3)

As a developer, I want to open a web dashboard that visualizes the project's evolution so I can quickly spot where complexity is growing and how file sizes and structure changed over time.

**Why this priority**: Visualization is what makes the collected data understandable and demonstrates product value, but it depends on stages 1 and 2 being in place first.

**Independent Test**: With a populated store, start the server, open the dashboard, and confirm it renders the complexity-over-time, top-N hotspots, and file-size-history views from the stored data.

**Acceptance Scenarios**:

1. **Given** a populated store, **When** the user starts the server and opens the dashboard, **Then** the dashboard reads from the store and displays charts/tables of the project history.
2. **Given** the dashboard is open, **When** the user views complexity trends, **Then** they can see how code complexity changed across commits, per file and per module.
3. **Given** the dashboard is open, **When** the user views hotspots, **Then** they see the top-N files/modules ranked by complexity and by complexity growth.
4. **Given** the dashboard is open, **When** the user views size history, **Then** they see how file sizes changed over time.
5. **Given** an analysis is in progress or finished, **When** the user opens the status page, **Then** they can see the current state of the analysis.

---

### User Story 4 - Use the tool as an installable CLI product (Priority: P2)

As a developer or CI pipeline, I want to install the tool as a package and drive it through a single, well-defined command-line interface so I can run analysis, queries, the server, and environment checks without invoking internal scripts by hand.

**Why this priority**: Packaging and a unified CLI are what make the tool usable and automatable in real workflows and CI. It is prioritized above visualization because it directly affects adoption and repeatable use of stages 1-2.

**Independent Test**: Install the package into a clean environment and run each top-level command (`analyze`, `query`, `serve`, `doctor`) successfully against the example repository.

**Acceptance Scenarios**:

1. **Given** a clean environment, **When** the user installs the package and runs the main command's help, **Then** the `analyze`, `query`, `serve`, and `doctor` subcommands are listed and documented.
2. **Given** the installed CLI, **When** the user runs `analyze` with a repository path, branch, and analysis directory, **Then** it performs a full history analysis (Story 1) and persists results (Story 2).
3. **Given** a populated store, **When** the user runs `query`, **Then** they get metric results from the store.
4. **Given** the installed CLI, **When** the user runs `serve`, **Then** the dashboard/API becomes available (Story 3).
5. **Given** any environment, **When** the user runs `doctor`, **Then** the tool checks and reports whether prerequisites (git availability, target repository validity, analysis directory writability, store accessibility) are satisfied.
6. **Given** configuration for repository path, project profile, and analysis directory, **When** the user runs any command, **Then** these settings are resolved consistently across all commands.

---

### Edge Cases

- **Empty or single-commit repository**: analysis completes and records what exists (zero or one commit) without error.
- **Repository with no analyzable modules/files at a given commit** (e.g., before the code was added): that commit is recorded with empty/zero metrics and the run continues.
- **Interrupted run** (user cancels or process dies mid-history): the isolated worktree is cleaned up or safely reusable, the original working tree stays intact, and a re-run can complete the remaining commits.
- **Re-running analysis on an already-analyzed project**: the default run is incremental — already-stored commits are skipped and only new commits are analyzed — without corrupting or duplicating prior results; a full rebuild is available on demand.
- **Very large history / large data volume**: the run does not require loading the entire history into memory at once and stays within reasonable local resource limits.
- **Branch not found / invalid ref**: the tool fails fast with a clear message before doing any work.
- **Stale or leftover worktree from a previous crashed run**: detected and recovered rather than blocking a new run.
- **Concurrent analysis attempts on the same project**: only one writer to the project's store is allowed; a second attempt is prevented or queued, not allowed to write simultaneously.

## Requirements *(mandatory)*

### Functional Requirements

#### History analysis (Stage 1)

- **FR-001**: The system MUST walk a target repository's non-merge commits on a specified branch in chronological order, from the first (root) commit to the tip; merge commits MUST be skipped.
- **FR-002**: The system MUST run the existing analyzer (the already-implemented metrics collection) unchanged at each commit and collect the same set of metrics it currently produces for the state of the project at that commit.
- **FR-003**: The system MUST always perform per-commit checkouts in an isolated git worktree (created unconditionally for every run) so that the user's original working tree, current branch, and uncommitted changes are never modified; the system MUST NEVER analyze through the user's working tree.
- **FR-004**: The system MUST record results at least at the granularity of `commit + file + metrics`, and MUST associate each result with its commit identity (e.g., commit hash, author, timestamp).
- **FR-005**: The system MUST display a progress bar during a CLI run (commits processed, total, and the current commit being analyzed), since the run may take a long time.
- **FR-006**: The system MUST keep the per-commit git checkout operations hidden from the user; checkout activity MUST NOT appear in normal CLI output (only the progress bar and result/error summaries are shown).
- **FR-007**: The system MUST continue the run when a single commit or file fails to analyze, recording the failure instead of aborting the whole run.
- **FR-008**: The system MUST define and document a stable result format for the collected history so downstream stages and external consumers can rely on it.
- **FR-009**: The system MUST clean up or safely reuse its isolated worktree after a run completes, is cancelled, or fails.

#### Durable storage (Stage 2)

- **FR-010**: The system MUST persist history results in a durable analytical store, using a separate store file per project.
- **FR-011**: The store MUST hold everything the analyzer produces per analyzed commit — at minimum commit records, per-commit file records, per-file metrics, per-module aggregate metrics, and cross-module coupling edges — in a structure suitable for analytical queries.
- **FR-012**: The system MUST route all writes to a project's store through a single writer so the store cannot be corrupted by concurrent writes.
- **FR-013**: The system MUST provide a way to run queries/reports against the stored data without re-running the analysis.
- **FR-014**: The store MUST carry a schema version, and the system MUST surface that version (and any incompatibility) to the user.
- **FR-015**: The system MUST treat re-analysis as incremental by default — commits already present in the store are skipped and only new commits are analyzed — while providing an on-demand full rebuild; neither path may produce duplicate or contradictory history.

#### Reports & visualization (Stage 3)

- **FR-016**: The system MUST expose the stored history through a local server providing data to a web dashboard.
- **FR-017**: The dashboard MUST visualize complexity-over-time per file and per module.
- **FR-018**: The dashboard MUST show the top-N files/modules by complexity and by complexity growth.
- **FR-019**: The dashboard MUST show the history of file sizes over time.
- **FR-020**: The dashboard MUST provide a status view of the analysis state.
- **FR-021**: The reporting/visualization layer MUST read exclusively from the durable store and MUST NOT re-run analysis itself.

#### CLI product (Stage 4)

- **FR-022**: The system MUST be distributable and installable as a Python package that exposes a single primary command-line entry point.
- **FR-023**: The CLI MUST provide the subcommands `analyze`, `query`, `serve`, and `doctor`.
- **FR-024**: `analyze` MUST trigger the full history analysis and persistence; `query` MUST read metrics from the store; `serve` MUST start the dashboard/API; `doctor` MUST verify environment prerequisites and report problems.
- **FR-025**: The CLI MUST provide a unified, consistent configuration for repository path, analysis profile, and analysis directory across all subcommands.
- **FR-026**: The system MUST include documentation describing installation and how to run each command, including a runnable example against the example repository.
- **FR-027**: The system MUST ensure its technical/analysis artifacts (store files, worktrees, runtime/working data) are kept out of the analyzed project's Git repository.

### Key Entities *(include if feature involves data)*

- **Repository**: the target project under analysis; identified by its path and the branch whose history is analyzed.
- **Commit**: one point in history; key attributes include commit hash, author, timestamp, and ordering within the history.
- **File-at-commit**: a file as it existed in a specific commit; links a file path to a commit and to its measured metrics.
- **Metric**: a measured value for a file (or aggregate container) at a commit — e.g., file size, line counts, cyclomatic complexity, cognitive complexity, AST-node counts, AST-node density. Metrics are extensible.
- **Module aggregate**: per-module roll-up of metrics (size and complexity) at a commit, as produced by the existing analyzer.
- **Coupling edge**: a cross-module relation detected at a commit (with kind and weight/score), as produced by the existing analyzer, recorded per commit.
- **Analysis run**: one execution of the history walk over a repository; carries status, progress, the branch analyzed, and a reference to the produced results.
- **Analysis store**: the per-project durable container holding commits, files-at-commit, metrics, module aggregates, coupling edges, run metadata, and a schema version.
- **Analysis failure record**: a captured error tied to a commit and/or file when analysis of that unit could not complete.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can run a single command against the example repository and obtain a complete per-commit metrics history covering 100% of the branch's non-merge commits (≈453) in one run.
- **SC-002**: Running the analysis never alters the target repository's currently checked-out branch, working tree, or uncommitted changes (verified: working-tree state is identical before and after a run).
- **SC-003**: After analysis, a user can answer "how did complexity of module X change over time?" via a query or the dashboard in under 5 seconds, without re-running the analysis.
- **SC-004**: The dashboard renders complexity-over-time, top-N hotspots, and file-size history for the analyzed project entirely from stored data.
- **SC-005**: A new user can install the package into a clean environment and successfully run `analyze`, `query`, `serve`, and `doctor` by following the documentation alone.
- **SC-006**: When a single commit fails to analyze, the run still completes and reports the count of successful vs. failed commits.
- **SC-007**: Re-running analysis on an already-analyzed project does not duplicate history and does not corrupt the store.
- **SC-008**: No analysis artifacts (store files, worktrees, runtime data) appear as untracked/committed files in the analyzed project's repository after a run.

## Assumptions

- **Scope reuse**: Stage 1 reuses the existing analyzer "as is" (the current Odoo coupling + complexity/size analysis). Generalizing into a base `python` profile vs. an `odoo` profile, plugins, multi-workspace, worker IPC, and parallelism are explicitly out of scope for this feature and belong to later roadmap stages (5+).
- **Profiles**: The default analysis profile is the existing Odoo-oriented analysis; a generic Python profile is not required for this feature but the data model should not preclude it.
- **Single project at a time**: This feature targets analyzing one project per run. Multi-workspace registry and per-workspace worker orchestration are out of scope here.
- **Local-only**: The tool runs fully locally with no mandatory external server, database service, container, or cloud infrastructure.
- **Branch selection**: The branch to analyze is provided by the user (example: `dev`); when omitted, a sensible default (the repository's current branch) is used.
- **Worktree location**: Isolated worktrees and other technical artifacts live outside the analyzed repository's tracked tree (in the configured analysis/runtime directory) to avoid polluting the project's Git repository and to avoid path-length issues.
- **Re-analysis policy**: Default behavior on re-run is to skip commits already present in the store; a full re-build is available on demand. (Exact flag naming is an implementation detail for planning.)
- **Technology constraints**: Concrete technologies for storage, server, packaging, and serialization are governed by the project constitution and `.devlocal/architecture.md` (e.g., DuckDB store, single-writer ownership, FastAPI/server mode, `uv`/PyPI packaging) and are resolved during planning, not in this specification.
- **Metric set**: The initially captured metrics are those the existing analyzer already produces (size, line counts by category, cyclomatic/cognitive complexity, AST-node "jones" density, and module coupling). Adding new metric types is a later, plugin-driven concern.
