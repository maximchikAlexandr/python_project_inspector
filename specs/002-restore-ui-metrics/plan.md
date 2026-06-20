# Implementation Plan: Restore Lost UI & Metrics Parity, Rename to `ppi`, In-Project `.ppi` Store

**Branch**: `002-restore-ui-metrics` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-restore-ui-metrics/spec.md`

## Summary

Restore the analytical depth and interactive report surfaces that were lost when `odoo_arch_inspector` was migrated into the history-aware pipeline (feature 001), layering them onto the existing DuckDB history store so every restored capability is commit-aware. The work has four technical thrusts plus two operational changes:

1. **Recover dropped analysis data** by extending the built-in analyzer (no `pluggy` yet, per E3): persist per-relation evidence (kind/file/line/detail — no source quote, per Clarifications), the graph-point breakdown (model_reuse/extension_or_method/view/field_property/total), `python_file_count`, each file's `top_folder`, declared/inherited model name lists, in-scope manifest dependencies, and the selected module scope.
2. **Add commit-scoped snapshot reads** (modules/files/detail/graph/edge-points/evidence) and new history series (per-category lines, file count, edge-kind counts, added/removed relations), exposed via **both** the CLI (`ppi query`) and the HTTP API (FR-039), additive to the existing time-series reads.
3. **Rebuild the report UI on the generic, registry-driven frontend** (per E2): an interactive force-directed module graph (old-tool parity), line-category and brightness toolbars, module/file detail panels, a file treemap, the module-code-lines and Python-file-complexity tables, the edge-points table with evidence, a manifest dependency view, and a parse/failure view — all driven by a commit selector and parameterized by an entity/metric/edge registry rather than hard-wired Odoo code.
4. **Fix consistency defects**: aggregation-aware hotspots and a single consistent edge-inclusion rule (with a zero-score toggle) so the structure chart and edge table agree.

Operational: **rename** the import package, console command, and PyPI distribution name from `python_project_inspector` to `ppi` (README product name and repo name preserved); and place each analyzed project's **DuckDB store inside an in-project `.ppi/` directory** with a self-ignoring `.ppi/.gitignore` (`*`), while worktrees/locks/runtime stay outside the repo.

This requires a **DuckDB schema bump (v1 → v2)**; since the store moves to `.ppi/` with no migration (fresh re-analysis), the schema change rides along cleanly.

## Technical Context

**Language/Version**: Python 3.11+ (backend), TypeScript 5.x / React 18 (frontend).

**Primary Dependencies**: existing — `click`, `duckdb`, `msgspec`, `Expression`, `toolz`, `radon`, `complexipy`, `fastapi`, `uvicorn`, `psutil`, `pydantic` (FastAPI boundary). Frontend adds graph/treemap layout via `d3-force` + `d3-hierarchy` (headless layout math; rendering stays React/SVG + Mantine). No new backend runtime dependency; `pluggy`/`anyio` remain deferred.

**Storage**: One DuckDB file per project at `<repo>/.ppi/history.duckdb` (in-project). Schema `SCHEMA_VERSION = 2` adds evidence, edge breakdown, module model lists, manifest depends, `top_folder`, `python_file_count`, and persisted analysis scope. Worktrees, write lock, and runtime metadata remain under the user-level analysis dir (`~/.local/share/ppi/<project_id>/`).

**Testing**: `pytest` (unit/contract/integration); small fixture Odoo repo for snapshot/evidence/series. Frontend smoke-tested manually for the MVP.

**Target Platform**: Local developer machine (macOS/Linux).

**Project Type**: Single installable Python package (`src/ppi/`) + co-located React frontend.

**Performance Goals**: None set for this feature (Clarifications): no explicit target for snapshot reads or graph rendering. Existing `<5s` query expectation from feature 001 is retained as a non-regression guide, not a new gate.

**Constraints**: Local-only; history streamed commit-by-commit; all writes through the single writer under a per-project lock; DuckDB store allowed inside the repo **only** as `.ppi/` (kept out of Git via self-ignoring `.gitignore`); every other artifact stays outside the repo (`assert_outside_repo` relaxed for the store only). Evidence stored without source quotes to bound volume.

**Scale/Scope**: Hundreds–low-thousands of commits; tens of thousands of file-at-commit rows; per-commit evidence rows (kind/file/line/detail) across all module pairs — bounded by streaming per commit. Odoo profile only; one project per run.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan complies |
|-----------|--------|------------------------|
| I. Functional Core, OO Shell | PASS | New collected data flows through pure transforms in `core/odoo/pipeline.py` and `core/analyzer.py` (evidence, breakdown, file count, top_folder, model lists) emitting typed batches; git/worktree, DuckDB writer, server, CLI remain the OO shell. The only mutation change is `CouplingEdge` retaining the evidence it already receives. |
| II. Layered Core Independence | PASS | `core/` gains no UI/HTTP/transport imports. New queries live in `storage/`, new endpoints in `server/`, new CLI in `cli/`, new views in `frontend/`. |
| III. Plugin Extensibility via Fact Contracts | PARTIAL (justified, unchanged from 001) | Per E3, `pluggy` stays deferred; new metrics/edges extend the single built-in analyzer behind the typed `AnalysisBatch` contract. The contract is widened (evidence, breakdown, model lists, scope) so a future registry can supply the same facts without reworking storage. See Complexity Tracking. |
| IV. CLI-First, Multi-Interface Clients | PASS (strengthened) | Every new read is exposed via the CLI **and** the HTTP API (FR-039). Per E2 the restored UI is built on a generic entity/metric/edge registry + active profile, not hard-wired Odoo, satisfying the "generic UI" mandate this feature previously risked. |
| V. Single-Writer Data Ownership | PARTIAL (justified, unchanged from 001) | The `analyze` process stays the sole writer behind the per-project lock (kept in the user-level dir, PID-liveness via `psutil`); `serve`/`query` open the store read-only. Worker/IPC remains deferred. See Complexity Tracking. |
| VI. Typed Contracts & Explicit Errors | PASS | New structs (`Evidence`, `EdgeBreakdown`, extended `CouplingEdge`/`ModuleAggregate`/`FileMetrics`, `AnalysisScope`) use `msgspec`; fallible reads return `Result`/raise typed store errors; Pydantic only at the FastAPI boundary (new response models in `server/schemas.py`). |

**Code style gates** (NON-NEGOTIABLE): double quotes; Google-style English docstrings; no narrating comments; module-level imports; concise solutions. Applied to all new/renamed Python.

Initial gate: **PASS with two justified partials** (III, V — carried over unchanged from feature 001). Re-checked post-design: still PASS; the schema/contract widening and the generic-UI registry introduce no new violations (E2 actually improves IV compliance).

## Project Structure

### Documentation (this feature)

```text
specs/002-restore-ui-metrics/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (schema v2 + contracts + entities)
├── quickstart.md        # Phase 1 output (validation scenarios)
├── contracts/           # Phase 1 output
│   ├── cli.md           # ppi CLI contract (rename + new query surfaces)
│   ├── analysis-batch.md# Extended msgspec fact/batch contract
│   └── http-api.md      # New snapshot/series endpoints + edge-inclusion rule
├── spec.md / spec.ru.md / checklists/
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/ppi/                          # RENAMED from src/python_project_inspector/
├── core/
│   ├── contracts.py              # + Evidence, EdgeBreakdown, AnalysisScope; extend CouplingEdge/ModuleAggregate/FileMetrics
│   ├── analyzer.py               # map evidence/breakdown/top_folder/python_file_count/model lists/scope into batch
│   └── odoo/
│       └── pipeline.py           # CouplingEdge keeps evidence; expose breakdown groups, model lists, file count, scope
├── history/                      # git/worktree/walker (import path rename only)
├── storage/
│   ├── schema.py                 # SCHEMA_VERSION=2; new tables + columns
│   ├── writer.py                 # persist evidence/breakdown/model lists/manifest depends/scope; new columns
│   └── queries.py                # snapshot reads + new series + aggregation-aware hotspots + consistent edge rule
├── runtime/
│   └── paths.py                  # in-repo .ppi store path + .ppi/.gitignore; worktree/lock stay user-level; relax assert for store only
├── server/
│   ├── api.py                    # new /snapshot/* and /metrics/* and /edges enhancements
│   └── schemas.py                # new Pydantic response models
└── cli/
    └── main.py                   # command/group renamed usage; new query surfaces; .ppi resolution

frontend/                         # React + Mantine + TypeScript (generic registry-driven)
├── src/
│   ├── registry/                 # entity-kind / metric-definition / edge-layer / profile registry (NEW)
│   ├── api/                      # typed client extended for snapshot/series/evidence
│   ├── components/               # graph (d3-force), treemap (d3-hierarchy), detail panels, tables, toolbars, evidence stack
│   └── pages/                    # snapshot page w/ commit selector; existing dashboard/structure/status updated
└── package.json                  # + d3-force, d3-hierarchy

pyproject.toml                    # name -> "ppi"; [project.scripts] ppi = "ppi.cli.main:cli"; hatch packages ["src/ppi"]
README.md                         # product name preserved; usage examples switch to `ppi`
tests/{unit,integration,contract} # extend for evidence/snapshot/series/edge-rule/.ppi/rename
```

**Structure Decision**: Keep the feature-001 layered package, renamed `src/python_project_inspector/` → `src/ppi/`. Extend the existing `core → storage → server/cli → frontend` seams rather than adding new top-level packages. The frontend gains a small `registry/` layer so the restored Odoo surfaces are generic-registry-driven (E2). The DuckDB store path moves into the analyzed repo's `.ppi/`; all other artifacts keep their user-level location.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| No `pluggy` plugin registry (Principle III partial) | E3 decision: this feature extends the existing single built-in analyzer; there is still only one analysis provider, so entry-point/pluggy discovery would add machinery with no second plugin. | Building the registry now gold-plates the MVP. Mitigation: the `AnalysisBatch` contract is widened (evidence, breakdown, model lists, scope) so a later registry supplies identical facts without touching storage/UI. |
| No worker runtime / IPC; `analyze` is the single writer behind a lock (Principle V partial) | Worker + Unix-socket IPC is a later roadmap stage; this feature still analyzes one project per run. | A full worker/IPC layer is disproportionate. Mitigation: per-project write lock (PID-liveness via `psutil`) in the user-level dir; `serve`/`query` open read-only. |
| DuckDB store placed inside the analyzed repo (`.ppi/`) | Owner requirement (E1): data should live with the project and be easy to find. | Keeping the store user-level (feature 001 default) was rejected by the owner. Mitigation: only the store is in-repo; a self-ignoring `.ppi/.gitignore` (`*`) keeps it out of Git; `assert_outside_repo` still guards every other artifact. |
