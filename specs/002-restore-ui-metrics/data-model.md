# Phase 1 Data Model: Restore Lost UI & Metrics Parity

Defines the extended `msgspec` contracts, the DuckDB schema v2 (new tables, new columns, persisted scope), and the read entities the snapshot/series layer exposes. Field names mirror the existing implementation so the diff stays minimal.

## 1. msgspec contracts (`src/ppi/core/contracts.py`)

### New structs

```text
Evidence(frozen)
  kind: str
  file_path: str            # module-relative ("module/rel/path") or manifest path
  line: int                 # 0 when not applicable (e.g., manifest_depends)
  detail: str               # human-readable reason (no source quote in this feature)

EdgeBreakdown(frozen)
  model_reuse: int
  extension_or_method: int
  view: int
  field_property: int
  total: int                # == model_reuse + extension_or_method + view + field_property

AnalysisScope(frozen)
  project_label: str
  module_prefixes: tuple[str, ...]
  include_modules: tuple[str, ...]
  all_modules: bool
```

### Extended structs (added fields, backward-compatible ordering with defaults)

```text
FileMetrics            + top_folder: str
ModuleAggregate        + python_file_count: int
                       + declared_models: tuple[str, ...]
                       + inherited_models: tuple[str, ...]
                       + manifest_depends: tuple[str, ...]   # in-scope only
CouplingEdge           + breakdown: EdgeBreakdown
                       + evidence: tuple[Evidence, ...]
ProjectRef             + scope: AnalysisScope                # persisted selected scope
```

`AnalysisBatch` is unchanged in shape (`commit`, `files`, `modules`, `edges`, `failures`) but its `edges`/`modules`/`files` now carry the richer fields. `batch_to_json`/`batch_from_json` continue to work (msgspec handles the new fields).

### Pipeline change (`core/odoo/pipeline.py`)

`CouplingEdge` (the dataclass) keeps an `evidence: list[Evidence]` alongside `kind_counter`; `add(kind, file_path, line, detail)` appends an `Evidence` and increments `kind_counter` (derive the counter from evidence, single source of truth). Add a pure `edge_breakdown(edge) -> EdgeBreakdown` using the existing `GRAPH_*_KINDS` groups; `edge_score` returns `edge_breakdown(edge).total`. Expose helpers for `python_file_count` (`len(module.python_complexity_files)`) and `top_folder` (first segment of `relative_path`).

## 2. DuckDB schema v2 (`src/ppi/storage/schema.py`)

`SCHEMA_VERSION = 2`. `assert_schema_compatible` already forces `--rebuild` on mismatch; combined with the `.ppi/` relocation this yields a clean v2 store.

### New columns on existing tables

```text
file_metric        + top_folder VARCHAR NOT NULL DEFAULT '.'
module_aggregate   + python_file_count INTEGER NOT NULL DEFAULT 0
project            + project_label VARCHAR NOT NULL DEFAULT ''
                   + module_prefixes VARCHAR NOT NULL DEFAULT ''   # comma-joined
                   + include_modules VARCHAR NOT NULL DEFAULT ''   # comma-joined
                   + all_modules BOOLEAN NOT NULL DEFAULT TRUE
```

### New tables

```text
coupling_edge_breakdown
  commit_hash VARCHAR NOT NULL
  source_module VARCHAR NOT NULL
  target_module VARCHAR NOT NULL
  model_reuse INTEGER NOT NULL
  extension_or_method INTEGER NOT NULL
  view INTEGER NOT NULL
  field_property INTEGER NOT NULL
  total INTEGER NOT NULL
  PRIMARY KEY (commit_hash, source_module, target_module)

coupling_edge_evidence
  commit_hash VARCHAR NOT NULL
  source_module VARCHAR NOT NULL
  target_module VARCHAR NOT NULL
  kind VARCHAR NOT NULL
  file_path VARCHAR NOT NULL
  line INTEGER NOT NULL
  detail VARCHAR NOT NULL
  -- no primary key: multiple evidence rows per (commit, source, target, kind);
  -- index on (commit_hash, source_module, target_module)

module_model
  commit_hash VARCHAR NOT NULL
  module_name VARCHAR NOT NULL
  model_name VARCHAR NOT NULL
  relation VARCHAR NOT NULL          # 'declared' | 'inherited'
  PRIMARY KEY (commit_hash, module_name, model_name, relation)

module_manifest_depend
  commit_hash VARCHAR NOT NULL
  module_name VARCHAR NOT NULL
  depends_on VARCHAR NOT NULL        # in-scope dependency module
  PRIMARY KEY (commit_hash, module_name, depends_on)
```

### Writer (`src/ppi/storage/writer.py`)

`write_batch(batch, run_id)` additionally inserts: `coupling_edge_breakdown` (one row per edge), `coupling_edge_evidence` (one row per evidence item), `module_model` (declared + inherited), `module_manifest_depend` (in-scope depends), and sets `file_metric.top_folder` and `module_aggregate.python_file_count`. `upsert_project` persists the `AnalysisScope` columns. `clear_project_data` truncates the new tables too. All inserts stay inside the existing per-commit transaction.

## 3. Read entities (`src/ppi/storage/queries.py`)

New read shapes (returned as dicts for CLI/JSON and mapped to Pydantic at the API):

```text
ModuleSnapshotRow      module_name, total_lines, line_categories{...}, python_file_count,
                       cyclomatic{count,mean,median,p95,max}, cognitive{...}, jones{...},
                       declared_models[], inherited_models[], score_in, score_out,
                       python_complexity_parse_errors
FileSnapshotRow        module_name, relative_path, top_folder, category, lines,
                       function_count, jones_line_count, cyclomatic{...}, cognitive{...},
                       jones{...}, parse_error
GraphPayload           nodes[ {module_name, total_lines, line_categories, python_file_count,
                                cyclomatic/cognitive/jones medians, method_count} ],
                       edges[ {source, target, score, breakdown{...} } ]
EdgePointRow           source, target, category, category_points, edge_total_points,
                       why_points (text), evidence[ {kind, file_path, line, detail} ]
ManifestDependRow      module_name, depends_on
RelationDiffRow        source, target, change ('added'|'removed'), score_a, score_b
SeriesPoint            commit_order, commit_hash, value   # reused for new series
```

New `StoreReader` methods: `modules_at_commit(commit?)`, `files_at_commit(commit?, module?)`, `module_detail(commit?, module)`, `file_detail(commit?, module, rel)`, `graph_at_commit(commit?)`, `edge_points(commit?, source?, target?, min_points=0)`, `edge_evidence(commit?, source, target)`, `module_models(commit?, module)`, `manifest_depends(commit?, module?)`, `module_lines_by_category_timeseries(module)`, `python_file_count_timeseries(module)`, `edge_kind_timeseries(kind?)`, `relations_diff(commit_a, commit_b)`. `hotspots(...)` gains an `agg` parameter (`{column}_{agg}`), replacing the hard-coded `_mean`. `method_count` in graph nodes/detail = `cyclomatic.count` (functions/methods from cyclomatic analysis — old-tool semantics, per Clarifications).

### Edge-inclusion rule (FR-027)

A single helper decides edge inclusion: by default include edges with `score >= 1`; an `include_zero_score` flag includes `score = 0` edges (kinds outside scoring groups). `coupling_structure_timeseries` and `edges_at_commit`/`edge_points` share this rule so the chart count equals the visible rows for the active setting.

## 4. Validation rules

- `EdgeBreakdown.total == model_reuse + extension_or_method + view + field_property`.
- `python_file_count >= 0`; equals the count of production Python files (excludes tests, `__manifest__.py`).
- `top_folder` is non-empty (`.` for module-root files).
- `module_model.relation ∈ {declared, inherited}`.
- `manifest_depends`/`module_manifest_depend` only contain in-scope modules (present in the analyzed module set under the selected scope).
- Evidence rows: `line >= 0`; `file_path` is module-relative or the manifest path; no source-quote field exists.
- Persisted scope round-trips: reading `ProjectRef.scope` reproduces the CLI scope used for analysis; incremental re-runs validate scope consistency (like branch/profile).

## 5. State & lifecycle

- One DuckDB file per project at `<repo>/.ppi/history.duckdb`; created with a sibling `<repo>/.ppi/.gitignore` (`*`).
- Writes only via the single writer under the user-level per-project lock; `serve`/`query` read-only.
- Re-analysis: incremental by default (skip stored commits); `--rebuild` clears project data (including new tables). No migration from the old user-level store (fresh repopulation).
- Schema mismatch (v1 store opened by v2 package) surfaces `SchemaIncompatibleError` → user re-runs `analyze --rebuild` against `.ppi/`.
