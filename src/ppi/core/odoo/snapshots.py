"""Immutable snapshots for module/class/analysis artifacts (PPI-003/PPI-041).

The legacy ``ModuleInfo``/``ClassSummary``/``AnalysisArtifacts`` are mutable
builders (lists/dicts/sets mutated in place during analysis). This module
defines their immutable ``*Facts``/*`Snapshot` counterparts built via
``freeze()`` so public results never expose mutable state.

Builders keep the legacy names for backwards compatibility with the pipeline's
in-place mutation; the immutable snapshots are the public boundary. Collections
in snapshots are ``tuple``/``frozenset`` only.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from types import MappingProxyType
from typing import TYPE_CHECKING

from ppi.core.odoo.complexity import ComplexityMetrics, FileComplexityInfo
from ppi.core.value_objects import ContractError, LineCategory

if TYPE_CHECKING:
    from ppi.core.odoo.pipeline import AnalysisArtifacts, ClassSummary, ModuleInfo, ReportConfig

__all__ = [
    "FileLineInfo",
    "ClassFacts",
    "ModuleFacts",
    "AnalysisArtifactsSnapshot",
    "AllModules",
    "PrefixScope",
    "IncludeScope",
    "PrefixAndIncludeScope",
    "ModuleScope",
    "module_scope_of",
    "DuplicatePolicy",
    "KeepFirst",
    "PreferPath",
    "FailOnDuplicate",
    "DuplicateModuleWarning",
    "ModuleCandidate",
    "select_module_candidates",
    "resolve_duplicate_modules",
    "LineCategoryCount",
    "LineCategoryCounts",
    "line_category_counts_from_mapping",
    "freeze_class_summary",
    "freeze_module_info",
    "freeze_analysis_artifacts",
]


@dataclass(frozen=True, slots=True)
class FileLineInfo:
    """Per-file line metrics (immutable snapshot)."""

    relative_path: str
    lines: int
    category: str
    complexity: ComplexityMetrics | None = None
    parse_error: str | None = None

    def __post_init__(self) -> None:
        # ponytail: __post_init__ rather than @deal.inv because FileLineInfo has
        # no factory — the direct constructor is the only creation path, and
        # deal.inv does not fire on __init__.
        if not isinstance(self.lines, int) or isinstance(self.lines, bool) or self.lines < 0:
            raise ContractError(f"FileLineInfo.lines must be >= 0, got {self.lines!r}")


@dataclass(frozen=True, slots=True)
class ClassFacts:
    """Immutable snapshot of one Python class's extracted metadata."""

    class_name: str
    file_path: Path
    model_names: frozenset[str] = field(default_factory=frozenset)
    declared_models: frozenset[str] = field(default_factory=frozenset)
    inherit_models: frozenset[str] = field(default_factory=frozenset)
    inherit_links: tuple[tuple[str, int], ...] = ()
    declared_methods: frozenset[str] = field(default_factory=frozenset)
    # ponytail: MappingProxyType keeps the frozen contract honest — callers
    # cannot mutate these even though they are mapping-typed (F3).
    declared_field_models: Mapping[str, str] = field(default_factory=lambda: MappingProxyType({}))
    field_models: Mapping[str, str] = field(default_factory=lambda: MappingProxyType({}))
    field_links: tuple[tuple[str, str, int, str], ...] = ()
    related_paths: tuple[tuple[str, int, str], ...] = ()
    depends_paths: tuple[tuple[str, int, str], ...] = ()
    onchange_paths: tuple[tuple[str, int, str], ...] = ()
    constrains_paths: tuple[tuple[str, int, str], ...] = ()
    env_accesses: tuple[tuple[str, int], ...] = ()
    method_calls: tuple[tuple[str, str, int], ...] = ()
    field_property_accesses: tuple[tuple[str, str, int], ...] = ()


@dataclass(frozen=True, slots=True)
class ModuleFacts:
    """Immutable snapshot of one analyzed module."""

    name: str
    path: Path
    manifest_path: Path
    manifest_depends: frozenset[str] = field(default_factory=frozenset)
    declared_models: frozenset[str] = field(default_factory=frozenset)
    inherited_models: frozenset[str] = field(default_factory=frozenset)
    class_facts: tuple[ClassFacts, ...] = ()
    python_lines: int = 0
    js_lines: int = 0
    python_test_lines: int = 0
    xml_lines: int = 0
    css_lines: int = 0
    html_lines: int = 0
    total_lines: int = 0
    files: tuple[FileLineInfo, ...] = ()
    complexity: ComplexityMetrics = field(default_factory=ComplexityMetrics)
    python_complexity_files: tuple[FileComplexityInfo, ...] = ()
    metrics: dict[str, float] = field(default_factory=dict)
    line_counts: dict[str, int] = field(default_factory=dict)

    def line_categories(self) -> Mapping[str, int]:
        """Return an immutable mapping of line-category key to value (F3)."""
        return MappingProxyType(
            {
                "python_lines": self.python_lines,
                "js_lines": self.js_lines,
                "python_test_lines": self.python_test_lines,
                "xml_lines": self.xml_lines,
                "css_lines": self.css_lines,
                "html_lines": self.html_lines,
            }
        )


@dataclass(frozen=True, slots=True)
class AnalysisArtifactsSnapshot:
    """Immutable snapshot of the full analysis artifacts.

    ``edge_snapshots`` are the immutable :class:`CouplingEdgeSnapshot` produced
    via :func:`ppi.core.odoo.facts.reduce_edge_facts` (F1). All mapping-typed
    fields are read-only :class:`MappingProxyType` so the frozen contract is
    honest (F3).
    """

    addons_paths: tuple[Path, ...]
    config: ReportConfig
    modules: Mapping[str, ModuleFacts] = field(default_factory=lambda: MappingProxyType({}))
    model_owners: Mapping[str, frozenset[str]] = field(default_factory=lambda: MappingProxyType({}))
    field_providers: Mapping[tuple[str, str], frozenset[str]] = field(
        default_factory=lambda: MappingProxyType({})
    )
    method_providers: Mapping[tuple[str, str], frozenset[str]] = field(
        default_factory=lambda: MappingProxyType({})
    )
    module_scores: Mapping[str, Mapping[str, int]] = field(
        default_factory=lambda: MappingProxyType({})
    )


# --- Module scope discriminated union (PPI-004/PPI-010) --------------------


@dataclass(frozen=True, slots=True)
class AllModules:
    """Scope: include every module."""

    def includes(self, module_name: str) -> bool:
        """AllModules includes every module name."""
        return True


@dataclass(frozen=True, slots=True)
class PrefixScope:
    """Scope: modules whose name starts with any of the prefixes."""

    prefixes: tuple[str, ...] = ()

    def includes(self, module_name: str) -> bool:
        """Return True if the module name matches any prefix."""
        return any(module_name.startswith(prefix) for prefix in self.prefixes)


@dataclass(frozen=True, slots=True)
class IncludeScope:
    """Scope: only explicitly listed modules."""

    include: frozenset[str] = field(default_factory=frozenset)

    def includes(self, module_name: str) -> bool:
        """Return True if the module name is explicitly included."""
        return module_name in self.include


@dataclass(frozen=True, slots=True)
class PrefixAndIncludeScope:
    """Scope: modules matching a prefix OR explicitly listed."""

    prefixes: tuple[str, ...] = ()
    include: frozenset[str] = field(default_factory=frozenset)

    def includes(self, module_name: str) -> bool:
        """Return True if the module matches a prefix or is explicitly included."""
        if module_name in self.include:
            return True
        return any(module_name.startswith(prefix) for prefix in self.prefixes)


ModuleScope = AllModules | PrefixScope | IncludeScope | PrefixAndIncludeScope


def module_scope_of(
    *,
    all_modules: bool,
    module_prefixes: tuple[str, ...] = (),
    include_modules: tuple[str, ...] = (),
) -> ModuleScope:
    """Build a typed :class:`ModuleScope` from CLI/config-shaped inputs (pure).

    Replaces the ``all_modules`` boolean + two tuples on :class:`ReportConfig`
    with a discriminated union selected via ``match``-friendly construction.
    """
    prefixes = tuple(sorted(set(module_prefixes)))
    include = frozenset(include_modules)
    if all_modules:
        return AllModules()
    if prefixes and include:
        return PrefixAndIncludeScope(prefixes=prefixes, include=include)
    if prefixes:
        return PrefixScope(prefixes=prefixes)
    if include:
        return IncludeScope(include=include)
    # No filter specified -> behave like all-modules (legacy semantics).
    return AllModules()


# --- Line category typed aggregate (PPI-055) ------------------------------


@dataclass(frozen=True, slots=True)
class LineCategoryCount:
    """One (category, count) record for a module's line breakdown."""

    category: LineCategory
    count: int

    def __post_init__(self) -> None:
        # ponytail: __post_init__ — no factory, deal.inv does not fire on init.
        if not isinstance(self.count, int) or isinstance(self.count, bool) or self.count < 0:
            raise ContractError(f"LineCategoryCount.count must be >= 0, got {self.count!r}")


@dataclass(frozen=True, slots=True)
class LineCategoryCounts:
    """Immutable aggregate of line counts per typed :class:`LineCategory`."""

    counts: tuple[LineCategoryCount, ...] = ()

    @classmethod
    def empty(cls) -> LineCategoryCounts:
        """Build empty counts (all categories at 0)."""
        return cls(counts=tuple(LineCategoryCount(cat, 0) for cat in LineCategory))

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, int]) -> LineCategoryCounts:
        """Build counts from a stringly ``{category_value: count}`` mapping."""
        records: list[LineCategoryCount] = []
        for cat in LineCategory:
            records.append(LineCategoryCount(cat, int(mapping.get(cat.value, 0))))
        return cls(counts=tuple(records))

    def count_of(self, category: LineCategory) -> int:
        """Return the count for one category (0 if absent)."""
        for record in self.counts:
            if record.category is category:
                return record.count
        return 0

    def total(self) -> int:
        """Return the total line count across all categories."""
        return sum(record.count for record in self.counts)

    def as_mapping(self) -> Mapping[str, int]:
        """Return a ``{category_value: count}`` mapping (serialization boundary, F3)."""
        return MappingProxyType({record.category.value: record.count for record in self.counts})


def line_category_counts_from_mapping(mapping: Mapping[str, int]) -> LineCategoryCounts:
    """Build :class:`LineCategoryCounts` from a stringly mapping (convenience)."""
    return LineCategoryCounts.from_mapping(mapping)


# --- Module discovery pure stages (PPI-004) --------------------------------


@dataclass(frozen=True, slots=True)
class KeepFirst:
    """Duplicate policy: keep the first-seen module, skip later ones."""


@dataclass(frozen=True, slots=True)
class PreferPath:
    """Duplicate policy: prefer the module at the given path prefix."""

    preferred_prefix: str


@dataclass(frozen=True, slots=True)
class FailOnDuplicate:
    """Duplicate policy: fail when a duplicate module name is seen."""


DuplicatePolicy = KeepFirst | PreferPath | FailOnDuplicate


@dataclass(frozen=True, slots=True)
class DuplicateModuleWarning:
    """One duplicate-module resolution warning (non-fatal)."""

    module_name: str
    kept_path: str
    skipped_path: str


@dataclass(frozen=True, slots=True)
class ModuleCandidate:
    """One candidate module discovered from a manifest path."""

    module_name: str
    module_path: Path
    manifest_path: Path


def select_module_candidates(
    manifest_paths: tuple[Path, ...],
    scope: ModuleScope,
) -> tuple[ModuleCandidate, ...]:
    """Select module candidates whose name is in scope (pure)."""
    out: list[ModuleCandidate] = []
    for manifest_path in manifest_paths:
        module_path = manifest_path.parent
        module_name = module_path.name
        if not scope.includes(module_name):
            continue
        out.append(
            ModuleCandidate(
                module_name=module_name,
                module_path=module_path,
                manifest_path=manifest_path,
            )
        )
    return tuple(out)


def resolve_duplicate_modules(
    candidates: tuple[ModuleCandidate, ...],
    policy: DuplicatePolicy,
) -> tuple[tuple[ModuleCandidate, ...], tuple[DuplicateModuleWarning, ...]]:
    """Resolve duplicate module names per a typed policy (pure).

    Returns ``(kept_candidates, warnings)``. Dispatch is via ``match policy:``.
    """
    seen: dict[str, ModuleCandidate] = {}
    warnings: list[DuplicateModuleWarning] = []
    kept_order: list[ModuleCandidate] = []
    for candidate in candidates:
        name = candidate.module_name
        if name not in seen:
            seen[name] = candidate
            kept_order.append(candidate)
            continue
        existing = seen[name]
        match policy:
            case KeepFirst():
                warnings.append(
                    DuplicateModuleWarning(
                        module_name=name,
                        kept_path=str(existing.module_path),
                        skipped_path=str(candidate.module_path),
                    )
                )
            case PreferPath(preferred_prefix=prefix):
                if str(candidate.module_path).startswith(prefix) and not str(
                    existing.module_path
                ).startswith(prefix):
                    seen[name] = candidate
                    kept_order = [candidate if c.module_name == name else c for c in kept_order]
                    warnings.append(
                        DuplicateModuleWarning(
                            module_name=name,
                            kept_path=str(candidate.module_path),
                            skipped_path=str(existing.module_path),
                        )
                    )
                else:
                    warnings.append(
                        DuplicateModuleWarning(
                            module_name=name,
                            kept_path=str(existing.module_path),
                            skipped_path=str(candidate.module_path),
                        )
                    )
            case FailOnDuplicate():
                raise ContractError(
                    f"Duplicate module name {name!r}: "
                    f"{existing.module_path} and {candidate.module_path}"
                )
    return tuple(kept_order), tuple(warnings)


# --- freeze() adapters -----------------------------------------------------


def freeze_class_summary(summary: ClassSummary) -> ClassFacts:
    """Freeze a mutable ``ClassSummary`` builder into immutable ``ClassFacts``."""
    return ClassFacts(
        class_name=summary.class_name,
        file_path=summary.file_path,
        model_names=frozenset(summary.model_names),
        declared_models=frozenset(summary.declared_models),
        inherit_models=frozenset(summary.inherit_models),
        inherit_links=tuple(summary.inherit_links),
        declared_methods=frozenset(summary.declared_methods),
        declared_field_models=MappingProxyType(dict(summary.declared_field_models)),
        field_models=MappingProxyType(dict(summary.field_models)),
        field_links=tuple(summary.field_links),
        related_paths=tuple(summary.related_paths),
        depends_paths=tuple(summary.depends_paths),
        onchange_paths=tuple(summary.onchange_paths),
        constrains_paths=tuple(summary.constrains_paths),
        env_accesses=tuple(summary.env_accesses),
        method_calls=tuple(summary.method_calls),
        field_property_accesses=tuple(summary.field_property_accesses),
    )


def freeze_module_info(module: ModuleInfo) -> ModuleFacts:
    """Freeze a mutable ``ModuleInfo`` builder into immutable ``ModuleFacts``."""
    return ModuleFacts(
        name=module.name,
        path=module.path,
        manifest_path=module.manifest_path,
        manifest_depends=frozenset(module.manifest_depends),
        declared_models=frozenset(module.declared_models),
        inherited_models=frozenset(module.inherited_models),
        class_facts=tuple(freeze_class_summary(cs) for cs in module.class_summaries),
        python_lines=module.python_lines,
        js_lines=module.js_lines,
        python_test_lines=module.python_test_lines,
        xml_lines=module.xml_lines,
        css_lines=module.css_lines,
        html_lines=module.html_lines,
        total_lines=module.total_lines,
        files=tuple(module.files),
        complexity=module.complexity,
        python_complexity_files=tuple(module.python_complexity_files),
        metrics={
            "python_file_count": len(module.python_complexity_files),
            "cyclomatic_count": module.complexity.cyclomatic.count,
            "cyclomatic_mean": module.complexity.cyclomatic.mean,
            "cyclomatic_median": module.complexity.cyclomatic.median,
            "cyclomatic_p95": module.complexity.cyclomatic.p95,
            "cyclomatic_max": module.complexity.cyclomatic.max,
            "cognitive_count": module.complexity.cognitive.count,
            "cognitive_mean": module.complexity.cognitive.mean,
            "cognitive_median": module.complexity.cognitive.median,
            "cognitive_p95": module.complexity.cognitive.p95,
            "cognitive_max": module.complexity.cognitive.max,
            "jones_count": module.complexity.jones.count,
            "jones_mean": module.complexity.jones.mean,
            "jones_median": module.complexity.jones.median,
            "jones_p95": module.complexity.jones.p95,
            "jones_max": module.complexity.jones.max,
        },
        line_counts={
            "python_lines": module.python_lines,
            "js_lines": module.js_lines,
            "python_test_lines": module.python_test_lines,
            "xml_lines": module.xml_lines,
            "css_lines": module.css_lines,
            "html_lines": module.html_lines,
            "total_lines": module.total_lines,
        },
    )


def freeze_analysis_artifacts(artifacts: AnalysisArtifacts) -> AnalysisArtifactsSnapshot:
    """Freeze mutable ``AnalysisArtifacts`` into immutable snapshot (F9).

    Edge snapshots are carried through :attr:`AnalysisArtifacts.edge_snapshots`
    (already immutable, F1); this freeze only handles modules/providers/scores.
    """
    return AnalysisArtifactsSnapshot(
        addons_paths=artifacts.addons_paths,
        config=artifacts.config,
        modules=MappingProxyType(
            {name: freeze_module_info(module) for name, module in artifacts.modules.items()}
        ),
        model_owners=MappingProxyType({k: frozenset(v) for k, v in artifacts.model_owners.items()}),
        field_providers=MappingProxyType(
            {k: frozenset(v) for k, v in artifacts.field_providers.items()}
        ),
        method_providers=MappingProxyType(
            {k: frozenset(v) for k, v in artifacts.method_providers.items()}
        ),
        module_scores=MappingProxyType(
            {k: MappingProxyType(dict(v)) for k, v in artifacts.module_scores.items()}
        ),
    )
