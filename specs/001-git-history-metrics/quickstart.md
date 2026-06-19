# Quickstart & Validation: Git History Metrics Pipeline (MVP Stages 1-4)

A run guide that proves the feature end-to-end against the example repository. Details live in `data-model.md`, `contracts/`, and `plan.md`; this file is the validation script.

## Prerequisites

- `git` available on PATH.
- `uv` installed.
- Example repo present at `/path/to/repo` with a `dev` branch (~453 non-merge commits). The repo may be checked out on any branch — the run must not disturb it (SC-002).

## Setup

```bash
uv sync                      # install backend deps from pyproject.toml
uv run python-project-inspector doctor \
  --repo /path/to/repo --branch dev
```
Expected: `doctor` prints an all-`OK` checklist (git, repo/branch, analysis dir writable, store openable, no stale lock/worktree).

## Scenario 1 — Full history analysis (US1, FR-001..FR-009)

```bash
# capture the repo's pre-run state to prove non-interference
git -C /path/to/repo rev-parse --abbrev-ref HEAD > /tmp/before.txt
git -C /path/to/repo status --porcelain >> /tmp/before.txt

uv run python-project-inspector analyze \
  --repo /path/to/repo --branch dev
```
**Expected**:
- A progress bar advances to `453/453` (count of non-merge commits); no `Checking out …`/git output appears (FR-006).
- Final line reports succeeded/failed counts and the store path (SC-001, SC-006).
- `git ... rev-parse`/`status` after the run match `/tmp/before.txt` exactly (SC-002).
- No new untracked files in the analyzed repo (`git -C … status --porcelain` empty) (SC-008).

## Scenario 2 — Durable store & queries (US2, FR-010..FR-014)

```bash
uv run python-project-inspector query \
  --repo /path/to/repo --branch dev \
  --metric complexity --module example_module --format table
```
**Expected**: rows of complexity-over-time for `example_module`, ordered chronologically, returned in under 5 seconds without re-running analysis (SC-003). The store contains commits, file metrics, module aggregates, and coupling edges (inspect via `query --metric edges`).

## Scenario 3 — Incremental re-run (FR-015, SC-007)

```bash
uv run python-project-inspector analyze \
  --repo /path/to/repo --branch dev
```
**Expected**: most/all commits skipped as already stored; only new commits (if any) analyzed; no duplicate history. `--rebuild` re-analyzes the full history.

## Scenario 4 — Dashboard (US3, FR-016..FR-021)

```bash
uv run python-project-inspector serve \
  --repo /path/to/repo --branch dev --open
```
**Expected**: dashboard loads from the store and renders complexity-over-time (per file and per module), top-N hotspots (by value and growth), file-size history, and a status view (SC-004). Backend matches `contracts/http-api.md`.

## Scenario 5 — CLI product surface (US4, FR-022..FR-027)

```bash
uv run python-project-inspector --help        # lists analyze/query/serve/doctor
```
**Expected**: all four subcommands documented; a clean-environment install + the steps above succeed from the README alone (SC-005).

## Failure-isolation check (FR-007 / SC-006)

Confirm that if a commit fails to analyze (e.g., a historically unpar. file), the run still completes and the summary reports the failed count; the `failure` table holds the captured error.

## Cleanup

```bash
uv run python-project-inspector doctor --repo … --branch dev   # confirms no stale lock/worktree remain
```
