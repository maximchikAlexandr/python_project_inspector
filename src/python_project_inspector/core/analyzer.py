"""Built-in analyzer provider for Odoo worktree analysis."""

from __future__ import annotations

from pathlib import Path

from expression.core.result import Error, Ok, Result
from toolz import pipe

from python_project_inspector.core.contracts import (
    AnalysisBatch,
    CommitRef,
    CouplingEdge,
    Distribution,
    FailureRecord,
    FileMetrics,
    ModuleAggregate,
)
from python_project_inspector.core.odoo.pipeline import (
    DistributionStats,
    FileComplexityInfo,
    FileLineInfo,
    ModuleInfo,
    attach_edges_and_scores,
    attach_provider_maps,
    build_report_config,
    discover_analysis_artifacts,
    enrich_modules_with_code_analysis,
    resolve_addons_paths,
    validate_addons_paths,
)

_EMPTY_DISTRIBUTION = Distribution(count=0, mean=0.0, median=0.0, p95=0.0, max=0.0)


def _distribution_from_stats(stats: DistributionStats) -> Distribution:
    """Map pipeline distribution stats to a contract Distribution."""
    return Distribution(
        count=stats.count,
        mean=stats.mean,
        median=stats.median,
        p95=stats.p95,
        max=stats.max,
    )


def _file_metrics(
    module_name: str,
    file_info: FileLineInfo,
    complexity_lookup: dict[str, FileComplexityInfo],
) -> FileMetrics:
    """Map one pipeline FileLineInfo to FileMetrics."""
    complexity_file = complexity_lookup.get(file_info.relative_path)
    complexity = file_info.complexity
    if complexity is None and complexity_file is not None:
        complexity = complexity_file.complexity
    if complexity is None:
        cyclomatic = cognitive = jones = _EMPTY_DISTRIBUTION
    else:
        cyclomatic = _distribution_from_stats(complexity.cyclomatic)
        cognitive = _distribution_from_stats(complexity.cognitive)
        jones = _distribution_from_stats(complexity.jones)
    return FileMetrics(
        module_name=module_name,
        relative_path=file_info.relative_path,
        category=file_info.category,
        lines=file_info.lines,
        function_count=complexity_file.function_count if complexity_file else 0,
        jones_line_count=complexity_file.jones_line_count if complexity_file else 0,
        cyclomatic=cyclomatic,
        cognitive=cognitive,
        jones=jones,
        parse_error=file_info.parse_error,
    )


def _module_aggregate(
    module_name: str,
    module: ModuleInfo,
    module_scores: dict[str, dict[str, int]],
) -> ModuleAggregate:
    """Map one pipeline ModuleInfo to ModuleAggregate."""
    scores = module_scores.get(module_name, {"outgoing_score": 0, "incoming_score": 0})
    return ModuleAggregate(
        module_name=module_name,
        total_lines=module.total_lines,
        line_categories=module.line_categories(),
        cyclomatic=_distribution_from_stats(module.complexity.cyclomatic),
        cognitive=_distribution_from_stats(module.complexity.cognitive),
        jones=_distribution_from_stats(module.complexity.jones),
        declared_models_count=len(module.declared_models),
        inherited_models_count=len(module.inherited_models),
        python_complexity_parse_errors=module.python_complexity_parse_errors,
        score_out=scores.get("outgoing_score", 0),
        score_in=scores.get("incoming_score", 0),
    )


def analyze_worktree(
    worktree_path: Path,
    commit: CommitRef,
    *,
    profile: str,
    addons_paths: tuple[Path, ...],
) -> Result[AnalysisBatch, str]:
    """Run the Odoo analysis pipeline on a checked-out worktree path."""
    if profile != "odoo":
        return Error(f"Unsupported analysis profile: {profile}")
    try:
        config = build_report_config(project_label=worktree_path.name, all_modules=True)
        artifacts = pipe(
            addons_paths,
            resolve_addons_paths,
            validate_addons_paths,
            discover_analysis_artifacts(config),
            enrich_modules_with_code_analysis,
            attach_provider_maps,
            attach_edges_and_scores,
        )
        files: list[FileMetrics] = []
        modules: list[ModuleAggregate] = []
        edges: list[CouplingEdge] = []
        failures: list[FailureRecord] = []
        for module_name, module in sorted(artifacts.modules.items()):
            complexity_lookup = {
                item.relative_path: item for item in module.python_complexity_files
            }
            for file_info in module.files:
                if file_info.parse_error:
                    failures.append(
                        FailureRecord(
                            commit_hash=commit.commit_hash,
                            file_path=f"{module_name}/{file_info.relative_path}",
                            error_text=file_info.parse_error,
                        ),
                    )
                files.append(_file_metrics(module_name, file_info, complexity_lookup))
            modules.append(_module_aggregate(module_name, module, artifacts.module_scores))
        for edge in artifacts.edges.values():
            if edge.score <= 0 and not edge.kind_counter:
                continue
            edges.append(
                CouplingEdge(
                    source_module=edge.source_module,
                    target_module=edge.target_module,
                    score=edge.score,
                    kinds=dict(edge.kind_counter),
                ),
            )
        return Ok(
            AnalysisBatch(
                commit=commit,
                files=tuple(files),
                modules=tuple(modules),
                edges=tuple(edges),
                failures=tuple(failures),
            ),
        )
    except ValueError as exc:
        return Error(str(exc))
    except Exception as exc:  # noqa: BLE001
        return Error(str(exc))
