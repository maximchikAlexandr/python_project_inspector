# Internal Contract: Analysis Batch & Result Format

Internal contracts use `msgspec` structs (Principle VI). They are the stable result format for the collected history (FR-008) and the seam the future pluggy registry will produce (Principle III). Fallible producers return `Result[...]`; optional fields use `Option`/`| None`.

## Structs

```python
class ProjectRef(msgspec.Struct, frozen=True):
    project_id: str
    repo_path: str
    branch: str
    profile: str  # "odoo" in MVP

class CommitRef(msgspec.Struct, frozen=True):
    commit_hash: str
    commit_order: int
    author_name: str
    author_email: str
    authored_at: int      # epoch seconds, UTC
    committed_at: int
    summary: str

class Distribution(msgspec.Struct, frozen=True):
    count: int
    mean: float
    median: float
    p95: float
    max: float

class FileMetrics(msgspec.Struct, frozen=True):
    module_name: str
    relative_path: str
    category: str
    lines: int
    function_count: int
    jones_line_count: int
    cyclomatic: Distribution
    cognitive: Distribution
    jones: Distribution
    parse_error: str | None = None

class ModuleAggregate(msgspec.Struct, frozen=True):
    module_name: str
    total_lines: int
    line_categories: dict[str, int]
    cyclomatic: Distribution
    cognitive: Distribution
    jones: Distribution
    declared_models_count: int
    inherited_models_count: int
    python_complexity_parse_errors: int
    score_out: int
    score_in: int

class CouplingEdge(msgspec.Struct, frozen=True):
    source_module: str
    target_module: str
    score: int
    kinds: dict[str, int]   # kind -> evidence count

class FailureRecord(msgspec.Struct, frozen=True):
    commit_hash: str | None
    file_path: str | None
    error_text: str

class AnalysisBatch(msgspec.Struct, frozen=True):
    """Everything the analyzer produces for one commit (FR-011)."""
    commit: CommitRef
    files: tuple[FileMetrics, ...]
    modules: tuple[ModuleAggregate, ...]
    edges: tuple[CouplingEdge, ...]
    failures: tuple[FailureRecord, ...]

class RunMeta(msgspec.Struct, frozen=True):
    run_id: str
    branch: str
    mode: str             # "incremental" | "rebuild"
    status: str           # "running" | "completed" | "failed" | "cancelled"
    started_at: int
    finished_at: int | None
    commits_total: int
    commits_succeeded: int
    commits_failed: int
```

## Producer/consumer contract

- **Producer**: `core.analyzer.analyze_worktree(path, profile_config) -> Result[AnalysisBatch]` is pure (no store/network I/O). One `AnalysisBatch` per analyzed commit.
- **Consumer**: `storage.writer` maps an `AnalysisBatch` to the tables in `data-model.md` inside one transaction; it is the only writer (FR-012).
- **Stability**: field names/types here are the documented result format (FR-008). Additive changes bump `SCHEMA_VERSION`; removals/renames are breaking and require a major bump + migration.
- **Determinism**: for a given `commit_hash` + profile, the batch is reproducible; re-analysis of an existing commit is a no-op in incremental mode.
