"""Pure mappers from pipeline domain artifacts to ``ppi.core.contracts`` DTOs.

These functions do not touch the filesystem or run the pipeline; they map
already-built :class:`AnalysisArtifacts` (and its parts) into the serializable
``AnalysisBatch`` contract. Mapping is testable on synthetic snapshots without
git/DuckDB/FastAPI.

The ``complexity is None`` branch in the legacy ``_file_metrics`` is replaced
by pattern matching over a typed :class:`ComplexityPresence` variant.

Edges are mapped from immutable :class:`CouplingEdgeSnapshot` (F1) and modules
from immutable :class:`ModuleFacts` via :func:`freeze_module_info` (F9). No
``object``/``type:ignore`` holes at the boundary (F10).
"""

from __future__ import annotations

from dataclasses import dataclass

from ppi.core.contracts import (
    AnalysisBatch,
    CommitRef,
    CouplingEdge,
    Distribution,
    FailureRecord,
    FileMetrics,
    ModuleAggregate,
)
from ppi.core.odoo.dist_stats import DistributionStats
from ppi.core.odoo.facts import CouplingEdgeSnapshot
from ppi.core.odoo.pipeline import AnalysisArtifacts
from ppi.core.odoo.snapshots import ModuleFacts, freeze_module_info

__all__ = [
    "ComplexityPresence",
    "distribution_from_stats",
    "module_to_file_metrics",
    "module_to_failures",
    "module_to_aggregate",
    "edge_snapshot_to_contract",
    "artifacts_to_batch_parts",
    "artifacts_to_analysis_batch",
    "in_scope_manifest_depends",
]

_EMPTY_DISTRIBUTION = Distribution(count=0, mean=0.0, median=0.0, p95=0.0, max=0.0)


def distribution_from_stats(stats: DistributionStats) -> Distribution:
    """Map pipeline distribution stats to a contract Distribution."""
    return Distribution(
        count=stats.count,
        mean=stats.mean,
        median=stats.median,
        p95=stats.p95,
        max=stats.max,
    )

# --- Complexity presence variant (replaces ``complexity is None`` if-chain) -


@dataclass(frozen=True, slots=True)
class Missing:
    """No complexity data available for a file."""


@dataclass(frozen=True, slots=True)
class Present:
    """Complexity data present for a file."""

    metrics: object


ComplexityPresence = Missing | Present


# --- Module -> contracts ---------------------------------------------------


def in_scope_manifest_depends(module: ModuleFacts, module_names: set[str]) -> tuple[str, ...]:
    """Return manifest dependencies limited to the analyzed module set."""
    return tuple(sorted(dep for dep in module.manifest_depends if dep in module_names))


def _metrics_from_complexity(
    complexity: object,
) -> dict[str, float]:
    c = complexity
    return {
        "cyclomatic_mean": c.cyclomatic.mean,
        "cyclomatic_median": c.cyclomatic.median,
        "cyclomatic_p95": c.cyclomatic.p95,
        "cyclomatic_max": c.cyclomatic.max,
        "cognitive_mean": c.cognitive.mean,
        "cognitive_median": c.cognitive.median,
        "cognitive_p95": c.cognitive.p95,
        "cognitive_max": c.cognitive.max,
        "jones_mean": c.jones.mean,
        "jones_median": c.jones.median,
        "jones_p95": c.jones.p95,
        "jones_max": c.jones.max,
    }


def _distributions_from_complexity(
    complexity: object,
) -> dict[str, Distribution]:
    c = complexity
    return {
        "cyclomatic": distribution_from_stats(c.cyclomatic),
        "cognitive": distribution_from_stats(c.cognitive),
        "jones": distribution_from_stats(c.jones),
    }


def module_to_file_metrics(
    module_name: str,
    module: ModuleFacts,
) -> tuple[FileMetrics, ...]:
    """Map one module's files to a tuple of ``FileMetrics`` (pure)."""
    complexity_lookup = {item.relative_path: item for item in module.python_complexity_files}
    out: list[FileMetrics] = []
    for file_info in module.files:
        complexity_file = complexity_lookup.get(file_info.relative_path)
        effective = file_info.complexity
        if effective is None and complexity_file is not None:
            effective = complexity_file.complexity
        if effective is not None:
            metrics = _metrics_from_complexity(effective)
            distributions = _distributions_from_complexity(effective)
            function_count = complexity_file.function_count if complexity_file else 0
            jones_line_count = complexity_file.jones_line_count if complexity_file else 0
        else:
            metrics = {
                "cyclomatic_mean": 0.0,
                "cyclomatic_median": 0.0,
                "cyclomatic_p95": 0.0,
                "cyclomatic_max": 0.0,
                "cognitive_mean": 0.0,
                "cognitive_median": 0.0,
                "cognitive_p95": 0.0,
                "cognitive_max": 0.0,
                "jones_mean": 0.0,
                "jones_median": 0.0,
                "jones_p95": 0.0,
                "jones_max": 0.0,
            }
            distributions = {
                "cyclomatic": _EMPTY_DISTRIBUTION,
                "cognitive": _EMPTY_DISTRIBUTION,
                "jones": _EMPTY_DISTRIBUTION,
            }
            function_count = 0
            jones_line_count = 0
        out.append(
            FileMetrics(
                module_name=module_name,
                relative_path=file_info.relative_path,
                line_category_id=file_info.category,
                metrics=metrics,
                line_counts={
                    "lines": file_info.lines,
                    "function_count": function_count,
                    "jones_line_count": jones_line_count,
                },
                distributions=distributions,
            )
        )
    return tuple(out)


def module_to_failures(
    module_name: str,
    module: ModuleFacts,
    commit_hash: str,
) -> tuple[FailureRecord, ...]:
    """Map one module's parse errors to ``FailureRecord`` tuple (pure)."""
    out: list[FailureRecord] = []
    for file_info in module.files:
        if file_info.parse_error:
            out.append(
                FailureRecord(
                    commit_hash=commit_hash,
                    file_path=f"{module_name}/{file_info.relative_path}",
                    error_text=file_info.parse_error,
                )
            )
    return tuple(out)


def module_to_aggregate(
    module_name: str,
    module: ModuleFacts,
    in_scope_deps: tuple[str, ...] = (),
) -> ModuleAggregate:
    """Map one module to a ``ModuleAggregate`` (pure)."""
    return ModuleAggregate(
        module_name=module_name,
        total_lines=module.total_lines,
        metrics={
            **_metrics_from_complexity(module.complexity),
            "python_file_count": len(module.python_complexity_files),
        },
        line_counts=dict(module.line_categories()),
        distributions=_distributions_from_complexity(module.complexity),
        manifest_depends=in_scope_deps,
    )


# --- Edges -> contracts ----------------------------------------------------


def edge_snapshot_to_contract(snapshot: CouplingEdgeSnapshot) -> CouplingEdge:
    """Map one :class:`CouplingEdgeSnapshot` to a ``CouplingEdge`` (pure)."""
    return CouplingEdge(
        source_module=snapshot.source_module.value,
        target_module=snapshot.target_module.value,
        score=snapshot.score,
        kinds=dict(snapshot.kinds_map),
        breakdown=snapshot.breakdown,
    )


def artifacts_to_batch_parts(
    artifacts: AnalysisArtifacts,
    commit: CommitRef,
) -> tuple[
    tuple[FileMetrics, ...],
    tuple[ModuleAggregate, ...],
    tuple[CouplingEdge, ...],
    tuple[FailureRecord, ...],
]:
    """Map full artifacts to (files, modules, edges, failures) tuples (pure).

    Modules are frozen to :class:`ModuleFacts` at this boundary (F9) so
    downstream mapping never touches mutable builders; edges come straight from
    the immutable :class:`CouplingEdgeSnapshot` stream (F1).
    """
    module_names = set(artifacts.modules)
    files: list[FileMetrics] = []
    modules: list[ModuleAggregate] = []
    failures: list[FailureRecord] = []
    for module_name, module in sorted(artifacts.modules.items()):
        facts = freeze_module_info(module)
        files.extend(module_to_file_metrics(module_name, facts))
        failures.extend(module_to_failures(module_name, facts, commit.commit_hash))
        in_scope_deps = in_scope_manifest_depends(facts, module_names)
        modules.append(
            module_to_aggregate(module_name, facts, in_scope_deps)
        )

    edges = tuple(
        edge_snapshot_to_contract(snapshot)
        for snapshot in artifacts.edge_snapshots
        if snapshot.score > 0 or snapshot.kind_counts
    )
    return tuple(files), tuple(modules), edges, tuple(failures)


def artifacts_to_analysis_batch(artifacts: AnalysisArtifacts, commit: CommitRef) -> AnalysisBatch:
    """Map full artifacts to a complete ``AnalysisBatch`` (pure)."""
    files, modules, edges, failures = artifacts_to_batch_parts(artifacts, commit)
    return AnalysisBatch(
        commit=commit,
        files=files,
        modules=modules,
        edges=edges,
        failures=failures,
    )
