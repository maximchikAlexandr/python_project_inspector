# Phase 0 Research: Restore Lost UI & Metrics Parity

All blocking unknowns were resolved during `/speckit-clarify` (recorded in `spec.md` → Clarifications and Open Questions & Escalations). This document consolidates the technical decisions, rationale, and rejected alternatives that shape Phase 1 design.

## D1. Evidence restoration without source quotes

**Decision**: Restore per-relation evidence as `(kind, file_path, line, detail)` only; do **not** capture or store source quotes (Clarifications). In `core/odoo/pipeline.py`, `CouplingEdge.add(kind, file_path, line, detail)` stops discarding its arguments and appends an `Evidence` item to a per-edge list; `edge_score`/breakdown continue to read `kind_counter` (derive the counter from the evidence list to avoid double bookkeeping).

**Rationale**: The pipeline already passes `file_path/line/detail` to every `edge.add(...)` call; only `add()` throws them away (`del file_path, line, detail`). Restoring evidence is therefore a localized change plus contract/storage propagation. Dropping quotes removes the worktree-timing and storage-volume problems entirely.

**Alternatives rejected**: Storing source quotes inline or via content-addressed blobs (owner deferred quotes); re-deriving evidence later from checkouts (impossible after worktree cleanup; expensive).

## D2. Graph-point breakdown

**Decision**: Compute and persist the per-edge breakdown using the existing scoring groups in `pipeline.py` (`GRAPH_MODEL_REUSE_KINDS`, `GRAPH_EXTENSION_METHOD_KINDS`, `GRAPH_VIEW_KINDS`, `GRAPH_FIELD_PROPERTY_KINDS`) → categories `model_reuse`, `extension_or_method`, `view`, `field_property`, and `total`. Persist as a dedicated table for query simplicity; it is also reproducible from `coupling_edge_kind` via the documented group mapping (kept as the source of truth).

**Rationale**: Groups already exist and back `edge_score`. Persisting the breakdown avoids recomputing group membership in SQL and matches the old edge-points table 1:1.

**Alternatives rejected**: Compute breakdown only in the API (re-implements group membership in SQL, drift risk).

## D3. `python_file_count` and `top_folder`

**Decision**: `python_file_count = len(module.python_complexity_files)` (production Python files, already excludes tests and `__manifest__.py`) — exact old-tool parity. `top_folder` = first path segment of a file's module-relative path (`relative_path.split("/")[0]`, or `"."` for module-root files). Persist `python_file_count` on `module_aggregate`; persist `top_folder` on `file_metric`.

**Rationale**: Both are pure derivations from data the pipeline already produces; no new analysis pass needed.

**Alternatives rejected**: Deriving file count via SQL `COUNT` at read time (loses the precise "production Python" definition; the gap report explicitly warns against conflating it with total files).

## D4. Declared/inherited model lists, manifest depends, and scope

**Decision**: Persist concrete `declared_models` and `inherited_models` name lists (already on `ModuleInfo`) and in-scope `manifest_depends` per module in child tables; keep the existing `*_count` columns for compatibility. Persist the selected analysis scope (`module_prefixes`, `include_modules`, `all_modules`, `project_label`) from `ReportConfig` on the `project`/`analysis_run` row. "In-scope" is defined relative to the selected scope (FR-040).

**Rationale**: `ModuleInfo.declared_models/inherited_models/manifest_depends` and `ReportConfig` already hold this; only persistence + read paths are missing.

**Alternatives rejected**: Counts-only (status quo) — cannot rebuild the old model/dependency views.

## D5. Module scope filtering restored

**Decision**: Re-expose `--module-prefix` (repeatable), `--include-module` (repeatable), and `--all-modules` on the CLI; thread them into `build_report_config(...)` instead of the hard-coded `all_modules=True` in `core/analyzer.py::analyze_worktree`. Persist the resolved scope (D4) and validate consistency on incremental re-runs (like branch/profile checks already do).

**Rationale**: `pipeline.py` already implements `module_matches_filter` and `build_report_config` honors prefixes/includes; only the CLI wiring and persistence are missing (feature 001 hard-coded `all_modules=True`).

**Alternatives rejected**: Leave always-all-modules (owner asked to restore filtering; "in-scope" deps need a defined scope).

## D6. Schema migration strategy

**Decision**: Bump `SCHEMA_VERSION` 1 → 2. Add tables `coupling_edge_evidence`, `coupling_edge_breakdown`, `module_model` (declared/inherited names), `module_manifest_depend`; add columns `module_aggregate.python_file_count` and `file_metric.top_folder`; add scope columns to `project`/`analysis_run`. No data migration: the store relocates to `.ppi/` and is repopulated by a fresh analysis run (Clarifications). Existing `assert_schema_compatible` already forces `--rebuild` on mismatch, which aligns with the fresh-store decision.

**Rationale**: New metrics require re-analysis regardless, so migrating the old v1 store yields no benefit. A clean v2 store in `.ppi/` is simplest and safest.

**Alternatives rejected**: In-place ALTER migration of the old user-level store (no benefit; added edge cases).

## D7. In-project `.ppi/` store location

**Decision**: `runtime/paths.py` resolves the DuckDB store to `<repo>/.ppi/history.duckdb`; on creation it writes `<repo>/.ppi/.gitignore` containing `*`. Worktree, write lock, and runtime metadata keep their user-level location (`~/.local/share/ppi/<project_id>/`). `assert_outside_repo` is relaxed for the store path only and continues to guard worktree/lock/runtime. `doctor` checks `.ppi/` writability and warns if `.ppi/` is already tracked in Git.

**Rationale**: Owner requirement (E1) with the smallest blast radius: only the store is in-repo; everything risky (nested git worktree, locks) stays outside; the self-ignoring `.gitignore` removes any need to edit the project's own ignore rules.

**Alternatives rejected**: All artifacts in `.ppi/` (nested git worktree inside the analyzed repo is fragile); configurable location (unnecessary for now — out of scope per E1 answer "duckdb_only").

## D8. Rename `python_project_inspector` → `ppi`

**Decision**: Rename the package directory `src/python_project_inspector/` → `src/ppi/`; rewrite all intra-package imports; set `pyproject.toml` `name = "ppi"`, `[project.scripts] ppi = "ppi.cli.main:cli"`, and hatch `packages = ["src/ppi"]`. Update `tests/` imports and any module docstrings/log names. Preserve the README product name and the git repository name. Console command and PyPI distribution name both become `ppi` (Clarifications).

**Rationale**: 31 references across 9 source files plus tests; a single mechanical rename keeps the change reviewable. Distribution rename approved by owner.

**Alternatives rejected**: Keeping the long distribution name (owner chose to shorten it); shim/alias package (ambiguous dual naming; edge case FR-034 forbids a reachable old import path).

## D9. Snapshot reads + new series + consistency fixes

**Decision**: Add read-only methods to `storage/queries.py`: `modules_at_commit`, `files_at_commit`, `module_detail`, `file_detail`, `graph_at_commit` (nodes + edges + breakdown), `edge_points` and `edge_evidence`; new series `module_lines_by_category_timeseries`, `python_file_count_timeseries`, `edge_kind_timeseries`, and `relations_diff(commit_a, commit_b)`. Make `hotspots(...)` accept `agg` and use `{column}_{agg}` (currently hard-coded `_mean`). Define a single edge-inclusion rule for the structure chart and edge table with an explicit `include_zero_score` toggle so counts match (FR-027).

**Rationale**: Each maps directly to gap-report items 1–13; the store already holds the base rows (or will after D1–D5).

**Alternatives rejected**: A separate snapshot store (duplicates data; breaks single-store-per-project).

## D10. Generic registry-driven UI + graph/treemap layout

**Decision**: Introduce a small frontend `registry/` describing entity kinds, metric definitions, edge layers, and the active profile; the restored surfaces consume the registry rather than hard-coding Odoo fields. Use `d3-force` for the force-directed graph layout (old-tool parity: attraction by edge points, curved reverse edges) and `d3-hierarchy` for the treemap layout; render with React/SVG + Mantine. A commit selector in shared page state drives all snapshot surfaces.

**Rationale**: Satisfies E2 (generic UI per Constitution IV / architecture §7). `d3-force`/`d3-hierarchy` are headless layout libraries (no DOM ownership), so they coexist with React rendering and Mantine styling; they are the de-facto standard for this layout math and avoid hand-rolling a physics simulation.

**Alternatives rejected**: Porting the old imperative `graph.js`/`ui.js` verbatim (hard-wires Odoo, violates IV); a heavyweight graph component library (drags in its own rendering/runtime, fights Mantine).

## D11. CLI + API parity for new data (FR-039)

**Decision**: Every new read (snapshots, detail, graph, edge points, evidence, new series, relations diff) is exposed via both new `ppi query` sub-surfaces and new HTTP endpoints, both backed by the same `StoreReader` methods.

**Rationale**: Owner decision ("available everywhere") and Constitution IV (CLI-first, server optional adapter over the same store).

**Alternatives rejected**: API-only (breaks CLI-first); CLI-only (breaks the dashboard).
