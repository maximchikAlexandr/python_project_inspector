# Contract: Analysis Fact Batch (msgspec)

The internal contract between the analysis core and the storage shell (`src/ppi/core/contracts.py`). Widened for evidence, edge breakdown, model lists, file count, top folder, and persisted scope. Shape of `AnalysisBatch` is unchanged; member structs gain fields. JSONL round-trip (`batch_to_json`/`batch_from_json`) stays compatible.

## Structs

### `Evidence` (new, frozen)

| Field | Type | Notes |
|-------|------|-------|
| `kind` | `str` | One of the existing relation kinds (`python__inherit`, `python_many2one`, `xml_inherit_id`, `security_ir_rule_model_ref`, `manifest_depends`, ...). |
| `file_path` | `str` | Module-relative path (`module/rel/path`) or manifest path. |
| `line` | `int` | `0` when not applicable. |
| `detail` | `str` | Human-readable reason. **No source quote** in this feature. |

### `EdgeBreakdown` (new, frozen)

| Field | Type | Notes |
|-------|------|-------|
| `model_reuse` | `int` | Sum of `GRAPH_MODEL_REUSE_KINDS`. |
| `extension_or_method` | `int` | Sum of `GRAPH_EXTENSION_METHOD_KINDS`. |
| `view` | `int` | Sum of `GRAPH_VIEW_KINDS`. |
| `field_property` | `int` | Sum of `GRAPH_FIELD_PROPERTY_KINDS`. |
| `total` | `int` | Equals the four above; equals legacy `edge.score`. |

### `AnalysisScope` (new, frozen)

| Field | Type | Notes |
|-------|------|-------|
| `project_label` | `str` | From `ReportConfig`. |
| `module_prefixes` | `tuple[str, ...]` | Sorted, deduped. |
| `include_modules` | `tuple[str, ...]` | Sorted, deduped. |
| `all_modules` | `bool` | True ⇒ prefixes ignored. |

### Extended structs

| Struct | Added fields |
|--------|--------------|
| `FileMetrics` | `top_folder: str` |
| `ModuleAggregate` | `python_file_count: int`, `declared_models: tuple[str, ...]`, `inherited_models: tuple[str, ...]`, `manifest_depends: tuple[str, ...]` (in-scope) |
| `CouplingEdge` (contract) | `breakdown: EdgeBreakdown`, `evidence: tuple[Evidence, ...]` |
| `ProjectRef` | `scope: AnalysisScope` |

`CommitRef`, `Distribution`, `FailureRecord`, `AnalysisBatch`, `RunMeta` unchanged in shape.

## Producer obligations (`core/`)

- `CouplingEdge.add(kind, file_path, line, detail)` MUST retain its arguments (stop `del`-ing them), appending an `Evidence` and incrementing the kind counter (counter derived from evidence).
- `edge_score(edge)` MUST equal `edge_breakdown(edge).total`.
- Edges with `total == 0` and no evidence are dropped (existing behavior); edges with non-scoring kinds (`total == 0`, evidence present) are retained and only filtered by the reader's `include_zero_score` rule.
- `ModuleAggregate.python_file_count` MUST equal the number of production Python files analyzed for complexity.
- `FileMetrics.top_folder` MUST equal the first segment of `relative_path` (`.` for module-root files).
- `manifest_depends` MUST be filtered to the in-scope module set.
- `ProjectRef.scope` MUST reflect the CLI-resolved scope.

## Consumer obligations (`storage/`)

- Persist all new fields into schema v2 tables/columns (see `data-model.md`), inside the existing per-commit transaction.
- Round-trip: `batch_from_json(batch_to_json(b)) == b` including new fields.
