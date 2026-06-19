# Implementation Plan: Git History Metrics Pipeline (MVP Stages 1-4)

**Branch**: `001-git-history-metrics` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-git-history-metrics/spec.md`

## Summary

Turn the current one-shot coupling analyzer (`report.py`) into a history-aware analytics pipeline. The tool walks a target repository's non-merge commits oldest→newest, checks out each commit in an isolated git worktree (silently), runs the existing analyzer unchanged at each commit, and writes per-file metrics, per-module aggregates, and cross-module coupling edges into a per-project DuckDB store through a single writer. The collected history is queryable via the CLI and visualizable in a React/Mantine dashboard served by an optional FastAPI server. Everything ships as one installable Python package exposing the `analyze`, `query`, `serve`, and `doctor` commands. Worker runtime, IPC, multi-workspace registry, the pluggy plugin registry, and parallel analysis are intentionally deferred to later roadmap stages (5+); the MVP anticipates those boundaries through typed fact contracts and a single-writer lock.

## Technical Context

**Language/Version**: Python 3.11+ (backend), TypeScript 5.x / React 18 (frontend)

**Primary Dependencies**: `click` (CLI), `duckdb` (analytical store), `msgspec` (internal contracts/serialization), `Expression` (`Result`/`Option`/`pipe`), `toolz` (functional transforms), `radon` + `complexipy` (existing complexity metrics), `fastapi` + `uvicorn` (optional server), `psutil` (lock/PID liveness for stale-lock recovery and `doctor`); frontend `React` + `Mantine`. `anyio` (a fixed end-state dependency) is NOT pulled into the MVP: stages 1-4 analysis is synchronous and the server uses FastAPI/uvicorn directly; `anyio` enters with the worker/runtime stages (7+). Git is driven via the `git` CLI (subprocess), including `git worktree`.

**Storage**: One DuckDB database file per analyzed project, located in the configured analysis directory (default: a user/runtime directory keyed by project, never inside the analyzed repo's tracked tree).

**Testing**: `pytest` (unit, integration, contract) for Python. Frontend smoke-tested manually for the MVP.

**Target Platform**: Local developer machine (macOS/Linux). Windows worktree/IPC parity is out of scope for this feature.

**Project Type**: Single installable Python package (CLI + optional web server) plus a co-located frontend.

**Performance Goals**: Complete a full ~453-commit history run end-to-end in one invocation (SC-001). Incremental re-runs analyze only new commits (FR-015). Queries return in under 5 seconds (SC-003). Analysis is sequential for the MVP (no parallelism).

**Constraints**: Local-only (no PostgreSQL/Docker/cloud). History MUST be streamed commit-by-commit, never fully loaded into memory (FR / Edge Cases). Per-commit checkouts run in an isolated worktree and MUST be invisible in CLI output (FR-003, FR-006). All writes to a project's store go through a single writer guarded by a per-project lock (FR-012). Technical artifacts MUST stay out of the analyzed repo (FR-027).

**Scale/Scope**: Hundreds to low-thousands of commits per project; tens of thousands of file-at-commit metric rows and module/edge rows. One project per run.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan complies |
|-----------|--------|------------------------|
| I. Functional Core, OO Shell | PASS | Pure analysis transforms (`facts → metrics → edges → batch`) live in `core/`; git/worktree, DuckDB writer, server, and CLI are the OO shell. The existing `report.py` pure functions are reused and adapted to emit typed batches. |
| II. Layered Core Independence | PASS | `core/` imports no CLI/HTTP/UI/transport modules. CLI, server, storage, history are layered above it. |
| III. Plugin Extensibility via Fact Contracts | PARTIAL (justified) | The pluggy registry is deferred to stage 10. The MVP wraps the existing analyzer as one built-in analysis provider behind a typed fact contract (per-file metrics, module aggregates, edges), so the future plugin boundary is anticipated but not yet generalized. See Complexity Tracking. |
| IV. CLI-First, Multi-Interface Clients | PASS | CLI is the mandatory interface (`analyze`/`query`/`serve`/`doctor`). The server is an optional adapter reading the same store. UI is data-driven from stored entity/metric/edge records. |
| V. Single-Writer Data Ownership | PARTIAL (justified) | The worker runtime is deferred to stages 7-8. The MVP enforces single-writer by making the `analyze` process the sole writer behind a per-project lock (PID-liveness checked via `psutil`); `serve`/`query` open the store read-only. See Complexity Tracking. |
| VI. Typed Contracts & Explicit Errors | PASS | Internal contracts (commit records, metric/edge batches, run metadata, failure records) use `msgspec`. Fallible operations (git reads, parsing, batch decode, store I/O) return `Result`; optional domain values use `Option`. Pydantic is used only at the FastAPI boundary. |

**Code style gates** (NON-NEGOTIABLE): double quotes; Google-style English docstrings, no narrating comments; module-level imports; concise solutions. Applied to all new Python.

Initial gate: **PASS with two justified partials** (documented in Complexity Tracking). Re-checked post-design: still PASS (no new violations introduced by the data model or contracts).

## Project Structure

### Documentation (this feature)

```text
specs/001-git-history-metrics/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── cli.md           # CLI command contract (analyze/query/serve/doctor)
│   ├── analysis-batch.md# Internal msgspec fact/batch + result-format contract
│   └── http-api.md      # FastAPI HTTP contract for the dashboard
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/python_project_inspector/
├── __init__.py
├── core/                     # Functional core (pure, no I/O, no exceptions out)
│   ├── contracts.py          # msgspec structs: CommitRef, FileMetrics, ModuleAggregate, CouplingEdge, AnalysisBatch, RunMeta, FailureRecord
│   ├── metrics.py            # pure metric transforms (reused from report.py)
│   └── analyzer.py           # built-in analysis provider: worktree path -> AnalysisBatch (adapts report.py logic)
├── history/                  # OO shell: git history + worktree lifecycle
│   ├── git.py                # git plumbing via subprocess (rev-list --no-merges --reverse, show, etc.)
│   ├── worktree.py           # create/cleanup isolated worktree; silent checkout
│   └── walker.py             # iterate non-merge commits, drive analyzer, emit batches, report progress
├── storage/                  # DuckDB single-writer store
│   ├── schema.py             # DDL + SCHEMA_VERSION + migration check
│   ├── writer.py             # single writer: upsert commits/files/metrics/aggregates/edges/runs/failures
│   └── queries.py            # read-only analytical queries
├── runtime/                  # paths, locking, runtime metadata
│   ├── paths.py              # resolve analysis dir, store path, worktree dir per project
│   └── lock.py               # per-project write lock + stale-lock recovery (psutil)
├── server/                   # Optional FastAPI adapter
│   ├── app.py                # app factory, read-only store access
│   └── api.py                # HTTP endpoints feeding the dashboard
└── cli/
    └── main.py               # click group: analyze, query, serve, doctor

frontend/                     # React + Mantine + TypeScript dashboard
├── src/
│   ├── api/                  # typed HTTP client
│   ├── components/           # charts/tables (complexity-over-time, hotspots, size history)
│   └── pages/                # dashboard + status views
├── index.html
├── package.json
└── tsconfig.json

tests/
├── unit/                     # pure core transforms, contracts, queries
├── integration/             # history walk + worktree + store on a small fixture repo
└── contract/                # CLI command contract + result-format + HTTP contract checks

pyproject.toml                # package metadata, CLI entry point, deps (uv-managed)
README.md                     # install + run docs (FR-026)
```

**Structure Decision**: Single Python package (`src/python_project_inspector/`) with a layered split that mirrors the constitution: a pure `core/` plus OO shells (`history/`, `storage/`, `runtime/`, `server/`, `cli/`). The co-located `frontend/` is a separate build consumed by `serve`. The legacy root `report.py`/`main.py` logic is migrated into `core/` (pure transforms) and `core/analyzer.py` (provider), then the root scripts are retired. Packaging is `uv`/`pyproject.toml` based for a PyPI-installable CLI entry point.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| No pluggy plugin registry in MVP (Principle III partial) | Stages 1-4 reuse the existing analyzer unchanged; building the entry-point/pluggy discovery now adds machinery with no second plugin to justify it (registry is roadmap stage 10). | Implementing pluggy now would gold-plate the MVP. Mitigation: the analyzer is wrapped behind a typed fact/batch contract (`AnalysisBatch`), so introducing the registry later does not require rewriting storage or the core. |
| No worker runtime / IPC; `analyze` process is the single writer guarded by a lock (Principle V partial) | A dedicated worker + Unix-socket IPC is roadmap stages 7-8; the MVP only needs one process writing one project's store at a time. | A full worker/IPC layer for a single-process CLI MVP is disproportionate. Mitigation: a per-project write lock with PID-liveness (psutil) enforces the single-writer guarantee; `serve`/`query` open the store read-only, preserving the ownership invariant the worker will later formalize. |
| No multi-workspace SQLite registry in MVP | This feature analyzes one project per run (spec Assumptions); the global registry is roadmap stage 9. | Building a registry now serves no current multi-project flow. Mitigation: project paths are resolved deterministically by `runtime/paths.py`, the natural seam where a registry plugs in later. |
| `anyio` deferred out of the MVP entirely | Stage 1-4 analysis is sequential CPU work and the server uses FastAPI/uvicorn directly; pervasive async/parallelism is roadmap stage 12 and the worker is stages 7-8. | Pulling `anyio` in now would be an unused dependency. Mitigation: `core`/`history` stay synchronous and easy to parallelize later; `anyio` enters with the worker/runtime stages where it is actually needed. |
