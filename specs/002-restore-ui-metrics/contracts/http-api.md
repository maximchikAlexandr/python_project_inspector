# HTTP API Contract

Read-only JSON over the in-project DuckDB store, served by `ppi serve` (`src/ppi/server/api.py`, models in `server/schemas.py`). All endpoints open the store read-only and return `409` while the writer lock is held and `503` when the store is missing or schema-incompatible (existing behavior). New endpoints are additive; existing endpoints keep their shapes (`/status`, `/commits`, `/catalog`, `/metrics/timeseries`, `/hotspots`, `/structure/timeseries`, `/edges`).

All snapshot endpoints accept an optional `commit` query param (defaults to the latest commit with rows).

## New / changed endpoints

### `GET /snapshot/modules`
Query: `commit?`. Returns module rows at the commit.
```text
{ commit_hash, modules: [ { module_name, total_lines, line_categories{python_lines,js_lines,python_test_lines,xml_lines,css_lines,html_lines},
  python_file_count, cyclomatic{count,mean,median,p95,max}, cognitive{...}, jones{...},
  declared_models[], inherited_models[], score_in, score_out, python_complexity_parse_errors } ] }
```

### `GET /snapshot/files`
Query: `commit?`, `module?`. Returns file rows (filtered to a module when given).
```text
{ commit_hash, files: [ { module_name, relative_path, top_folder, category, lines,
  function_count, jones_line_count, cyclomatic{...}, cognitive{...}, jones{...}, parse_error } ] }
```

### `GET /snapshot/module/{module_name}`
Query: `commit?`. One module incl. `declared_models[]`, `inherited_models[]`, `manifest_depends[]`, score breakdown, and its files.

### `GET /snapshot/file`
Query: `commit?`, `name` (`module/relative/path`). One file detail incl. `top_folder`.

### `GET /graph`
Query: `commit?`, `include_zero_score=false`. Force-directed graph payload.
```text
{ commit_hash, nodes: [ { module_name, total_lines, line_categories, python_file_count, method_count,
  cyclomatic_median, cognitive_median, jones_median, score_in, score_out } ],
  edges: [ { source, target, score, breakdown{model_reuse,extension_or_method,view,field_property,total} } ] }
```
`method_count == cyclomatic.count` (old-tool semantics).

### `GET /edges` (extended)
Query: `commit?`, `min_score=0`, `include_zero_score=false`. Adds `breakdown{...}`, `kind_occurrence_count`, and `evidence_count` to each edge. The inclusion rule here MUST match `/structure/timeseries` for the same `include_zero_score` value (FR-027). When `include_zero_score=false`, effective minimum score is `max(min_score, 1)`.

### `GET /edge-points`
Query: `commit?`, `source`, `target`, `include_zero_score=false`. Per-category points plus evidence.
```text
{ commit_hash, source, target, breakdown{...},
  points: [ { category, points, why_points } ],
  why_points: { category: "kind=count, ..." },
  evidence: [ { kind, file_path, line, detail } ] }
```

### `POST /edge-points/batch`
Body: `{ commit?, include_zero_score?, pairs: [ { source, target } ] }` (max 500 pairs). Returns `{ commit_hash, edges: [EdgePointsResponse...], missing: [ { source, target } ] }` for pairs absent or excluded by the inclusion rule.

### `GET /edge-evidence`
Query: `commit?`, `source`, `target`, `include_zero_score=false`. Evidence rows only for one edge pair.

### `GET /models`
Query: `commit?`, `module`. Declared and inherited model name lists for one module.

### `GET /depends`
Query: `commit?`, `module?`. In-scope manifest dependencies for one module, or all modules when `module` is omitted.

### `GET /failures`
Query: `commit?`. Parse/analysis failure rows for one commit.
```text
{ commit_hash, failures: [ { commit_hash, file_path, error_text } ] }
```

### `GET /metrics/timeseries` (extended)
`metric` accepts new values: `lines_by_category` (returns one series per category for a module) and `python_file_count` (module file-count series). `agg` continues to apply to complexity metrics.

### `GET /hotspots` (changed)
Query gains `agg=mean|median|p95|max` (default `mean`); the SQL uses `{column}_{agg}` instead of hard-coded `_mean`.

### `GET /edge-kinds/timeseries`
Query: `kind?`. Edge-kind counts over commit history (all kinds when omitted).

### `GET /relations/diff`
Query: `commit_a`, `commit_b`. Added/removed relations between two commits.
```text
{ commit_a, commit_b, changes: [ { source, target, change: "added"|"removed", score_a, score_b } ] }
```

## Pydantic models (`server/schemas.py`)

Add response models mirroring the shapes above (`ModuleSnapshotResponse`, `FileSnapshotResponse`, `GraphResponse` with `GraphNode`/`GraphEdge`/`EdgeBreakdownResponse`, `EdgePointsResponse`, `RelationsDiffResponse`, `EdgeKindSeriesResponse`) and extend `EdgeResponse` with `breakdown`. Pydantic is used only at this boundary; internal reads stay dict/`msgspec`.

## Errors

| Condition | Status |
|-----------|--------|
| Writer lock held | `409 analysis in progress` |
| Store missing | `503 store not found` |
| Schema incompatible (v1) | `503` with rebuild instruction |
| Unknown module/file/commit | `404` |
| Missing required query param (e.g., `source`/`target`, `commit_a`/`commit_b`) | `422` |
