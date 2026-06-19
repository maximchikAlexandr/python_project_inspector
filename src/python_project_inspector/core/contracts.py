"""Internal msgspec contracts for analysis batches and run metadata."""

from __future__ import annotations

import msgspec


class ProjectRef(msgspec.Struct, frozen=True):
    """Identify the analyzed repository and branch."""

    project_id: str
    repo_path: str
    branch: str
    profile: str


class CommitRef(msgspec.Struct, frozen=True):
    """One commit in the analyzed history."""

    commit_hash: str
    commit_order: int
    author_name: str
    author_email: str
    authored_at: int
    committed_at: int
    summary: str


class Distribution(msgspec.Struct, frozen=True):
    """Distribution summary for one metric family."""

    count: int
    mean: float
    median: float
    p95: float
    max: float


class FileMetrics(msgspec.Struct, frozen=True):
    """Per-file metrics at one commit."""

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
    """Per-module roll-up at one commit."""

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
    """Directed coupling between two modules at one commit."""

    source_module: str
    target_module: str
    score: int
    kinds: dict[str, int]


class FailureRecord(msgspec.Struct, frozen=True):
    """Non-fatal analysis failure tied to a commit and optional file."""

    commit_hash: str | None
    file_path: str | None
    error_text: str


class AnalysisBatch(msgspec.Struct, frozen=True):
    """Everything the analyzer produces for one commit."""

    commit: CommitRef
    files: tuple[FileMetrics, ...]
    modules: tuple[ModuleAggregate, ...]
    edges: tuple[CouplingEdge, ...]
    failures: tuple[FailureRecord, ...]


class RunMeta(msgspec.Struct, frozen=True):
    """Metadata for one analyze invocation."""

    run_id: str
    branch: str
    mode: str
    status: str
    started_at: int
    finished_at: int | None
    commits_total: int
    commits_succeeded: int
    commits_failed: int


_ENCODER = msgspec.json.Encoder()
_DECODER = msgspec.json.Decoder(AnalysisBatch)


def batch_to_json(batch: AnalysisBatch) -> str:
    """Serialize one analysis batch to a JSON line."""
    return _ENCODER.encode(batch).decode("utf-8")


def batch_from_json(line: str) -> AnalysisBatch:
    """Deserialize one analysis batch from a JSON line."""
    return _DECODER.decode(line.encode("utf-8"))
