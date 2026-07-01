"""Internal msgspec contracts for analysis batches and run metadata."""

from __future__ import annotations

import msgspec


class AnalysisScope(msgspec.Struct, frozen=True):
    """Selected module scope for one analysis run."""

    project_label: str
    module_prefixes: tuple[str, ...] = ()
    include_modules: tuple[str, ...] = ()
    all_modules: bool = True


class ProjectRef(msgspec.Struct, frozen=True):
    """Identify the analyzed repository and branch."""

    project_id: str
    repo_path: str
    branch: str
    profile: str
    scope: AnalysisScope | None = None


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
    line_category_id: str
    metrics: dict[str, float]
    line_counts: dict[str, int]
    distributions: dict[str, Distribution]


class ModuleAggregate(msgspec.Struct, frozen=True):
    """Per-module roll-up at one commit."""

    module_name: str
    total_lines: int
    metrics: dict[str, float]
    line_counts: dict[str, int]
    distributions: dict[str, Distribution]
    manifest_depends: tuple[str, ...] = ()


class CouplingEdge(msgspec.Struct, frozen=True):
    """Directed coupling between two modules at one commit."""

    source_module: str
    target_module: str
    score: int
    kinds: dict[str, int]
    breakdown: dict[str, int] | None = None


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


# JSON serialization lives in :mod:`ppi.adapters.serialization` (PPI-016) so
# this module stays a pure schema/value-contract layer. The names are
# re-exported here for backwards compatibility with callers that still import
# ``batch_to_json``/``batch_from_json`` from ``ppi.core.contracts``.
from ppi.adapters.serialization import (  # noqa: E402,F401
    batch_from_json,
    batch_to_json,
)