# Phase 1 Data Model: Git History Metrics Pipeline (MVP Stages 1-4)

This model maps the spec's Key Entities to the per-project DuckDB store and to the internal `msgspec` contracts (see `contracts/analysis-batch.md`). One DuckDB file holds exactly one project's history.

## Entity overview

| Spec entity | Store table(s) | Internal contract |
|-------------|----------------|-------------------|
| Repository / project | `project` | `ProjectRef` |
| Commit | `commit` | `CommitRef` |
| Analysis run | `analysis_run` | `RunMeta` |
| File-at-commit + Metric | `file_metric` | `FileMetrics` |
| Module aggregate | `module_aggregate` | `ModuleAggregate` |
| Coupling edge | `coupling_edge`, `coupling_edge_kind` | `CouplingEdge` |
| Analysis failure record | `failure` | `FailureRecord` |
| (versioning) | `meta` | — |

## Tables

### `meta`
Single-row table describing the store itself.

| Column | Type | Notes |
|--------|------|-------|
| `schema_version` | INTEGER | Must equal the package `SCHEMA_VERSION`; mismatch surfaced to user (FR-013/FR-014). |
| `tool_version` | VARCHAR | Package version that created/migrated the store. |
| `created_at` | TIMESTAMP | UTC. |

### `project`
Single-row table identifying the analyzed project.

| Column | Type | Notes |
|--------|------|-------|
| `project_id` | VARCHAR PK | Stable id derived from canonical repo path. |
| `repo_path` | VARCHAR | Absolute path to the analyzed repository. |
| `branch` | VARCHAR | Branch whose history is analyzed (e.g., `dev`). |
| `profile` | VARCHAR | Analysis profile (`odoo` for MVP). |

### `analysis_run`
One row per `analyze` invocation.

| Column | Type | Notes |
|--------|------|-------|
| `run_id` | VARCHAR PK | UUID. |
| `branch` | VARCHAR | Branch analyzed in this run. |
| `mode` | VARCHAR | `incremental` \| `rebuild` (FR-015). |
| `status` | VARCHAR | `running` \| `completed` \| `failed` \| `cancelled`. |
| `started_at` / `finished_at` | TIMESTAMP | `finished_at` null while running. |
| `commits_total` | INTEGER | Commits selected for this run (after incremental skip). |
| `commits_succeeded` | INTEGER | Successfully analyzed + stored. |
| `commits_failed` | INTEGER | Commits with a recorded failure (SC-006). |

**State transitions**: `running → completed` (all selected commits attempted), `running → failed` (fatal/setup error), `running → cancelled` (user interrupt). Only fully-committed per-commit transactions count as stored, making interrupted runs resumable.

### `commit`
One row per analyzed non-merge commit.

| Column | Type | Notes |
|--------|------|-------|
| `commit_hash` | VARCHAR PK | 40-hex SHA. |
| `commit_order` | INTEGER | 0-based chronological index (root = 0). |
| `author_name` / `author_email` | VARCHAR | From git metadata. |
| `authored_at` / `committed_at` | TIMESTAMP | UTC. |
| `summary` | VARCHAR | First line of the commit message. |

### `file_metric`
One row per file analyzed at a commit (file-at-commit + its metrics). Reuses exactly the metrics the current analyzer produces.

| Column | Type | Notes |
|--------|------|-------|
| `commit_hash` | VARCHAR FK→`commit` | Part of PK. |
| `module_name` | VARCHAR | Owning module (Odoo module / top container). Part of PK. |
| `relative_path` | VARCHAR | POSIX path within the module. Part of PK. |
| `category` | VARCHAR | `python_lines`, `js_lines`, `xml_lines`, etc. |
| `lines` | INTEGER | Physical line count. |
| `function_count` | INTEGER | Python production files only; else 0. |
| `jones_line_count` | INTEGER | Counted AST lines. |
| `cc_count`/`cc_mean`/`cc_median`/`cc_p95`/`cc_max` | INTEGER/DOUBLE | Cyclomatic distribution (radon). |
| `cog_count`/`cog_mean`/`cog_median`/`cog_p95`/`cog_max` | INTEGER/DOUBLE | Cognitive distribution (complexipy). |
| `jones_count`/`jones_mean`/`jones_median`/`jones_p95`/`jones_max` | INTEGER/DOUBLE | AST-node density distribution. |
| `parse_error` | VARCHAR NULL | Set when the file failed to parse (non-fatal). |

**PK**: (`commit_hash`, `module_name`, `relative_path`).

### `module_aggregate`
One row per module at a commit (the analyzer's per-module roll-up).

| Column | Type | Notes |
|--------|------|-------|
| `commit_hash` | VARCHAR FK→`commit` | Part of PK. |
| `module_name` | VARCHAR | Part of PK. |
| `total_lines` | INTEGER | Sum across categories. |
| `python_lines`/`js_lines`/`python_test_lines`/`xml_lines`/`css_lines`/`html_lines` | INTEGER | Line categories. |
| `cc_*`/`cog_*`/`jones_*` | INTEGER/DOUBLE | Module-level complexity distributions. |
| `declared_models_count`/`inherited_models_count` | INTEGER | Odoo model counts. |
| `python_complexity_parse_errors` | INTEGER | Count of files that failed complexity parsing. |
| `score_out`/`score_in` | INTEGER | Coupling graph points out/in. |

**PK**: (`commit_hash`, `module_name`).

### `coupling_edge`
One row per directed source→target module pair detected at a commit.

| Column | Type | Notes |
|--------|------|-------|
| `commit_hash` | VARCHAR FK→`commit` | Part of PK. |
| `source_module` | VARCHAR | Part of PK. |
| `target_module` | VARCHAR | Part of PK. |
| `score` | INTEGER | Total graph points for the edge. |

**PK**: (`commit_hash`, `source_module`, `target_module`).

### `coupling_edge_kind`
Per-kind breakdown for an edge (e.g., `python__inherit`, `xml_ref`).

| Column | Type | Notes |
|--------|------|-------|
| `commit_hash` | VARCHAR | Part of PK + FK to `coupling_edge`. |
| `source_module` | VARCHAR | Part of PK. |
| `target_module` | VARCHAR | Part of PK. |
| `kind` | VARCHAR | Part of PK. |
| `count` | INTEGER | Evidence count for the kind. |

**PK**: (`commit_hash`, `source_module`, `target_module`, `kind`).

### `failure`
Non-fatal analysis failures (FR-007 / SC-006).

| Column | Type | Notes |
|--------|------|-------|
| `run_id` | VARCHAR FK→`analysis_run` | |
| `commit_hash` | VARCHAR NULL | Null only for run-level setup failures. |
| `file_path` | VARCHAR NULL | Null for commit-level failures. |
| `error_text` | VARCHAR | Captured error message. |

## Validation rules

- `commit_hash` is a 40-character lowercase hex string; `commit_order` is unique and contiguous from 0.
- All metric counts/sizes are non-negative; distribution `*_count = 0` implies the related mean/median/p95/max are 0.
- `relative_path` is POSIX, relative to its module root; `(commit_hash, module_name, relative_path)` is unique.
- `analysis_run.status` and `analysis_run.mode` are constrained to their enumerations.
- `schema_version` is a positive integer equal to the package constant for the store to be readable without migration.
- Re-analysis is idempotent: writing a `commit` that already exists is a no-op in `incremental` mode; `rebuild` clears project rows first.

## Indexing (read paths for FR-013 / SC-003)

- `file_metric (module_name, commit_hash)` and `module_aggregate (module_name, commit_hash)` to serve "metric over time for module X".
- `commit (commit_order)` for chronological ordering.
- `coupling_edge (commit_hash)` for per-commit graph reads.
