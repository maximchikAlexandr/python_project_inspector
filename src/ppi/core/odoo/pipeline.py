"""Odoo module analysis pipeline."""

from __future__ import annotations

import ast
import csv
import re
import sys
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

import complexipy

# ponytail: Result returned at the core boundary instead of ValueError so the
# runner never matches on exception text; the shell still prints warnings.
from expression.core.result import Error, Ok, Result
from radon.visitors import ComplexityVisitor
from toolz import curry, valmap


from ppi.core.errors import InvalidAddonsPath, ManifestDiscoveryError
from ppi.core.odoo.ast_extract import (
    extract_string_list,
    extract_string_literal,
    extract_target_names,
)
from ppi.core.odoo.ast_facts import edge_kind_for_relational_field
from ppi.core.odoo.complexity import (
    ComplexityMetrics,
    FileComplexityAnalysisResult,
    FileComplexityInfo,
)
from ppi.core.odoo.dist_stats import build_distribution_stats
from ppi.core.odoo.edge_scoring import module_scores_from_edges
from ppi.core.odoo.facts import (
    CouplingEdgeSnapshot,
    EdgeFact,
    reduce_edge_facts,
)
from ppi.core.odoo.file_classification import classify_relative_file
from ppi.core.odoo.manifest import parse_manifest_source
from ppi.core.odoo.model_expr import (
    AliasState,
    ModelResolutionContext,
    extract_env_subscript_model,
    is_env_object,
    resolve_model_expr,
)
from ppi.core.odoo.snapshots import (
    AllModules,
    ClassFacts,
    IncludeScope,
    KeepFirst,
    ModuleFacts,
    PrefixAndIncludeScope,
    PrefixScope,
    freeze_analysis_artifacts,
    freeze_class_summary,
    freeze_module_info,
    module_scope_of,
    resolve_duplicate_modules,
    select_module_candidates,
)

RELATIONAL_FIELD_TYPES = {"Many2one", "One2many", "Many2many"}
RECORDSET_CHAIN_METHODS = {
    "sudo",
    "with_context",
    "with_company",
    "with_user",
    "with_env",
    "search",
    "browse",
    "filtered",
    "filtered_domain",
    "sorted",
    "exists",
    "mapped",
}
IGNORED_MODEL_ATTRIBUTE_NAMES = {
    "id",
    "ids",
    "display_name",
    "env",
    "_name",
    "_context",
    "_origin",
}
EXTERNAL_ID_RE = re.compile(r"([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)")
PERCENT_EXTERNAL_ID_RE = re.compile(r"%\(([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\)d")

from ppi.core.value_objects import (  # noqa: E402
    EdgeKind,
    LineCategory,
    edge_kind_of,
)

CSS_FILE_SUFFIXES = {".css", ".scss", ".less", ".sass"}


@dataclass(slots=True)
class CouplingEdgeAccumulator:
    """Mutable accumulator for one source-target module pair during analysis.

    The immutable boundary contract lives in :mod:`ppi.core.contracts`
    (``CouplingEdge`` frozen msgspec struct); this type is the in-pipeline
    accumulator that gathers evidence before the frozen snapshot is built.
    """

    source_module: str
    target_module: str
    kind_counter: Counter = field(default_factory=Counter)

    def add(self, kind: str, file_path: Path, line: int, detail: str) -> None:
        """Record one coupling between two modules."""
        self.kind_counter[kind] += 1

    @property
    def score(self) -> int:
        """Compute graph points for this edge."""
        return sum(self.kind_counter.values())


@dataclass(frozen=True, slots=True)
class FileLineInfo:
    """Store per-file line metrics (mutable builder companion to snapshots.FileLineInfo)."""

    relative_path: str
    lines: int
    category: str
    complexity: ComplexityMetrics | None = None
    parse_error: str | None = None


@dataclass(slots=True)
class ClassSummary:
    """Store extracted metadata for one Python class."""

    file_path: Path
    class_name: str
    model_names: set[str] = field(default_factory=set)
    declared_models: set[str] = field(default_factory=set)
    inherit_models: set[str] = field(default_factory=set)
    inherit_links: list[tuple[str, int]] = field(default_factory=list)
    declared_methods: set[str] = field(default_factory=set)
    declared_field_models: dict[str, str] = field(default_factory=dict)
    field_models: dict[str, str] = field(default_factory=dict)
    field_links: list[tuple[str, str, int, str]] = field(default_factory=list)
    related_paths: list[tuple[str, int, str]] = field(default_factory=list)
    depends_paths: list[tuple[str, int, str]] = field(default_factory=list)
    onchange_paths: list[tuple[str, int, str]] = field(default_factory=list)
    constrains_paths: list[tuple[str, int, str]] = field(default_factory=list)
    env_accesses: list[tuple[str, int]] = field(default_factory=list)
    method_calls: list[tuple[str, str, int]] = field(default_factory=list)
    field_property_accesses: list[tuple[str, str, int]] = field(default_factory=list)

    def freeze(self) -> ClassFacts:
        """Freeze this mutable builder into an immutable :class:`ClassFacts` snapshot."""
        return freeze_class_summary(self)


@dataclass(slots=True)
class ModuleInfo:
    """Store metadata for one analyzed module."""

    name: str
    path: Path
    manifest_path: Path
    manifest_depends: set[str] = field(default_factory=set)
    declared_models: set[str] = field(default_factory=set)
    inherited_models: set[str] = field(default_factory=set)
    class_summaries: list[ClassSummary] = field(default_factory=list)
    python_lines: int = 0
    js_lines: int = 0
    python_test_lines: int = 0
    xml_lines: int = 0
    css_lines: int = 0
    html_lines: int = 0
    total_lines: int = 0
    files: list[FileLineInfo] = field(default_factory=list)
    complexity: ComplexityMetrics = field(default_factory=ComplexityMetrics)
    python_complexity_files: list[FileComplexityInfo] = field(default_factory=list)
    python_complexity_parse_errors: int = 0

    def line_categories(self) -> dict[str, int]:
        """Return mapping of line-category key to value."""
        return {
            category.value: getattr(self, category.value)
            for category in LineCategory
        }

    def freeze(self) -> ModuleFacts:
        """Freeze this mutable builder into an immutable :class:`ModuleFacts` snapshot."""
        return freeze_module_info(self)


@dataclass(frozen=True, slots=True)
class ReportConfig:
    """Store configurable report settings."""

    project_label: str
    module_prefixes: tuple[str, ...] = ()
    include_modules: tuple[str, ...] = ()
    all_modules: bool = False


@dataclass(frozen=True, slots=True)
class AnalysisArtifacts:
    """Carry the main analysis pipeline state between pure-ish steps.

    Edges are carried as immutable :class:`CouplingEdgeSnapshot` snapshots built
    via :func:`reduce_edge_facts` from an :class:`EdgeFact` stream (F1/F9). The
    mutable :class:`CouplingEdgeAccumulator` is now a builder-only concern that
    never leaves this module's analysis functions.
    """

    addons_paths: tuple[Path, ...]
    config: ReportConfig
    modules: dict[str, ModuleInfo]
    model_owners: dict[str, set[str]] = field(default_factory=dict)
    field_providers: dict[tuple[str, str], set[str]] = field(default_factory=dict)
    method_providers: dict[tuple[str, str], set[str]] = field(default_factory=dict)
    edge_snapshots: tuple[CouplingEdgeSnapshot, ...] = ()
    module_scores: dict[str, dict[str, int]] = field(default_factory=dict)

    def freeze(self):
        """Freeze this artifacts holder into an immutable snapshot.

        Edge snapshots are already immutable; ``freeze_analysis_artifacts``
        carries modules/providers/scores through the boundary (F9).
        """
        return freeze_analysis_artifacts(self)


def file_top_folder(relative_path: str) -> str:
    """Return the first path segment of a module-relative file path."""
    parts = relative_path.split("/")
    return parts[0] if len(parts) > 1 else "."


def module_python_file_count(module: ModuleInfo) -> int:
    """Return the production Python file count for one module."""
    return len(module.python_complexity_files)


class MethodAnalyzer(ast.NodeVisitor):
    """Extract env access and method call links inside one Python method.

    Thin visitor shell (PPI-008): only walks the AST and populates a local
    builder. All model-expression resolution, env-object detection, env
    subscript extraction and target-name extraction are delegated to pure
    functions in :mod:`ppi.core.odoo.model_expr` and
    :mod:`ppi.core.odoo.ast_extract`, so the rules are unit-testable on tiny
    AST fragments without running this visitor.
    """

    def __init__(
        self,
        class_summary: ClassSummary,
        global_relational_fields: dict[str, dict[str, str]],
    ) -> None:
        """Initialize analyzer with class field mapping."""
        self.class_summary = class_summary
        self.global_relational_fields = global_relational_fields
        self.env_aliases: set[str] = set()
        self.model_aliases: dict[str, str] = {}
        self.env_accesses: list[tuple[str, int]] = []
        self.method_calls: list[tuple[str, str, int]] = []
        self.field_property_accesses: list[tuple[str, str, int]] = []
        self.node_stack: list[ast.AST] = []

    def _build_context(self) -> ModelResolutionContext:
        """Build an immutable resolution context from current alias state."""
        state = AliasState(
            env_aliases=frozenset(self.env_aliases),
            model_aliases=frozenset(self.model_aliases.items()),
        )
        return ModelResolutionContext(
            aliases=state,
            class_model_names=frozenset(self.class_summary.model_names),
            relational_fields=self.global_relational_fields,
        )

    def visit(self, node: ast.AST) -> Any:  # noqa: ANN401
        """Track parent stack for richer AST context."""
        self.node_stack.append(node)
        try:
            return super().visit(node)
        finally:
            self.node_stack.pop()

    def _get_parent_node(self) -> ast.AST | None:
        """Return current parent AST node."""
        if len(self.node_stack) < 2:
            return None
        return self.node_stack[-2]

    def _register_aliases(self, target: ast.AST | None, model_name: str | None) -> None:
        """Register model aliases on assignment-like operations (builder mutation)."""
        if not model_name:
            return
        for target_name in extract_target_names(target):
            self.model_aliases[target_name] = model_name

    def visit_Assign(self, node: ast.Assign) -> None:
        """Track aliases for env object and model recordsets."""
        ctx = self._build_context()
        target_names: list[str] = []
        for target in node.targets:
            target_names.extend(extract_target_names(target))
        if target_names and is_env_object(node.value, ctx):
            self.env_aliases.update(target_names)

        model_name = resolve_model_expr(node.value, ctx)
        if target_names and model_name:
            for target in node.targets:
                self._register_aliases(target, model_name)

        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        """Track aliases from annotated assignments."""
        if not isinstance(node.target, ast.Name) or node.value is None:
            self.generic_visit(node)
            return

        ctx = self._build_context()
        if is_env_object(node.value, ctx):
            self.env_aliases.add(node.target.id)

        self._register_aliases(node.target, resolve_model_expr(node.value, ctx))

        self.generic_visit(node)

    def visit_For(self, node: ast.For) -> None:
        """Track aliases introduced by for-loop targets."""
        ctx = self._build_context()
        self._register_aliases(node.target, resolve_model_expr(node.iter, ctx))
        self.generic_visit(node)

    def visit_AsyncFor(self, node: ast.AsyncFor) -> None:
        """Track aliases introduced by async-for targets."""
        ctx = self._build_context()
        self._register_aliases(node.target, resolve_model_expr(node.iter, ctx))
        self.generic_visit(node)

    def visit_With(self, node: ast.With) -> None:
        """Track aliases introduced by with-context managers."""
        ctx = self._build_context()
        for item in node.items:
            self._register_aliases(
                item.optional_vars,
                resolve_model_expr(item.context_expr, ctx),
            )
        self.generic_visit(node)

    def visit_AsyncWith(self, node: ast.AsyncWith) -> None:
        """Track aliases introduced by async-with context managers."""
        ctx = self._build_context()
        for item in node.items:
            self._register_aliases(
                item.optional_vars,
                resolve_model_expr(item.context_expr, ctx),
            )
        self.generic_visit(node)

    def visit_NamedExpr(self, node: ast.NamedExpr) -> None:
        """Track aliases from walrus operator."""
        ctx = self._build_context()
        self._register_aliases(node.target, resolve_model_expr(node.value, ctx))
        self.generic_visit(node)

    def visit_Subscript(self, node: ast.Subscript) -> None:
        """Capture direct model access patterns via env[...] syntax."""
        ctx = self._build_context()
        model_name = extract_env_subscript_model(node, ctx)
        if model_name:
            self.env_accesses.append((model_name, getattr(node, "lineno", 0)))
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        """Capture method calls on model recordsets."""
        if isinstance(node.func, ast.Attribute):
            ctx = self._build_context()
            model_name = resolve_model_expr(node.func.value, ctx)
            if model_name:
                self.method_calls.append(
                    (model_name, node.func.attr, getattr(node, "lineno", 0)),
                )
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        """Capture field/property access on model recordsets."""
        parent = self._get_parent_node()
        if isinstance(parent, ast.Call) and parent.func is node:
            self.generic_visit(node)
            return
        if node.attr in IGNORED_MODEL_ATTRIBUTE_NAMES or node.attr.startswith("__"):
            self.generic_visit(node)
            return

        ctx = self._build_context()
        model_name = resolve_model_expr(node.value, ctx)
        if model_name:
            self.field_property_accesses.append(
                (model_name, node.attr, getattr(node, "lineno", 0)),
            )
        self.generic_visit(node)


def build_report_config(
    *,
    project_label: str,
    module_prefixes: tuple[str, ...] = (),
    include_modules: tuple[str, ...] = (),
    all_modules: bool = True,
) -> ReportConfig:
    """Build report configuration for module discovery."""
    if all_modules:
        normalized_module_prefixes: tuple[str, ...] = ()
    else:
        normalized_module_prefixes = tuple(sorted(set(module_prefixes)))
    return ReportConfig(
        project_label=project_label,
        module_prefixes=normalized_module_prefixes,
        include_modules=tuple(sorted(set(include_modules))),
        all_modules=all_modules,
    )


def resolve_addons_paths(addons_paths: Iterable[Path]) -> tuple[Path, ...]:
    """Resolve all incoming addons paths to absolute form."""
    return tuple(path.resolve() for path in addons_paths)


def validate_addons_paths(
    addons_paths: tuple[Path, ...],
) -> Result[tuple[Path, ...], InvalidAddonsPath]:
    """Validate that every addons path is an existing directory.

    Returns a typed ``Error(InvalidAddonsPath)`` instead of raising
    ``ValueError`` so the runner no longer matches on exception text (F2).
    """
    invalid_paths = tuple(str(p) for p in addons_paths if not p.is_dir())
    if invalid_paths:
        return Error(InvalidAddonsPath(paths=invalid_paths))
    return Ok(addons_paths)


@curry
def discover_analysis_artifacts(
    config: ReportConfig,
    addons_paths: tuple[Path, ...],
) -> Result[AnalysisArtifacts, ManifestDiscoveryError]:
    """Discover filtered modules and initialize analysis state.

    Returns a typed ``Error(ManifestDiscoveryError)`` when no matching modules
    are found, instead of raising ``ValueError`` (F2).
    """
    modules = discover_modules(list(addons_paths), config)
    if not modules:
        return Error(
            ManifestDiscoveryError(addons_paths=tuple(str(p) for p in addons_paths)),
        )
    return Ok(
        AnalysisArtifacts(
            addons_paths=addons_paths,
            config=config,
            modules=modules,
        ),
    )


def enrich_modules_with_code_analysis(artifacts: AnalysisArtifacts) -> AnalysisArtifacts:
    """Run module analyzers and return updated pipeline state (pure chain).

    Each stage returns a new modules dict via ``replace`` so the input
    ``artifacts.modules`` is never mutated; ``deepcopy`` is no longer needed as
    an architectural defense (PPI-006).
    """
    with_code_size = analyze_module_code_size(artifacts.modules)
    with_complexity = analyze_python_complexity(with_code_size)
    with_python_facts = analyze_python_modules(with_complexity)
    return replace(artifacts, modules=with_python_facts)


def attach_provider_maps(artifacts: AnalysisArtifacts) -> AnalysisArtifacts:
    """Build owner/provider indexes from analyzed modules."""
    return replace(
        artifacts,
        model_owners=build_model_owners(artifacts.modules),
        field_providers=build_field_providers(artifacts.modules),
        method_providers=build_method_providers(artifacts.modules),
    )


def attach_edges_and_scores(artifacts: AnalysisArtifacts) -> AnalysisArtifacts:
    """Build cross-module edges and score aggregates.

    Edges are accumulated in mutable :class:`CouplingEdgeAccumulator` builders
    (internal), then converted to an :class:`EdgeFact` stream and reduced into
    immutable :class:`CouplingEdgeSnapshot` via :func:`reduce_edge_facts` (F1).
    Per-module scores are derived from the snapshots via the typed
    :func:`module_scores_from_edges` so there is a single scoring rule.
    """
    edges: dict[tuple[str, str], CouplingEdgeAccumulator] = {}
    add_manifest_links(artifacts.modules, edges)
    analyze_python_links(
        modules=artifacts.modules,
        model_owners=artifacts.model_owners,
        field_providers=artifacts.field_providers,
        method_providers=artifacts.method_providers,
        edges=edges,
    )
    analyze_xml_links(artifacts.modules, edges)

    facts = _accumulators_to_edge_facts(edges)
    snapshots = reduce_edge_facts(facts)
    score_triples = tuple(
        (s.source_module.value, s.target_module.value, s.score) for s in snapshots
    )
    module_scores = module_scores_from_edges(artifacts.modules.keys(), score_triples)
    return replace(
        artifacts,
        edge_snapshots=snapshots,
        module_scores=module_scores,
    )


def _accumulators_to_edge_facts(
    edges: dict[tuple[str, str], CouplingEdgeAccumulator],
) -> tuple[EdgeFact, ...]:
    """Convert mutable accumulators into an immutable :class:`EdgeFact` stream."""
    from ppi.core.value_objects import ModuleName

    out: list[EdgeFact] = []
    for edge in edges.values():
        src = ModuleName.parse(edge.source_module)
        tgt = ModuleName.parse(edge.target_module)
        if src is None or tgt is None:
            continue
        for kind_str in edge.kind_counter:
            kind_typed = edge_kind_of(kind_str)
            if kind_typed is None:
                continue
            out.append(EdgeFact(source_module=src, target_module=tgt, kind=kind_typed))
    return tuple(out)


def local_tag_name(tag: str) -> str:
    """Return XML local tag name without namespace."""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def module_matches_filter(module_name: str, config: ReportConfig) -> bool:
    """Check whether module should be included according to CLI filter settings.

    Delegates to a typed :class:`ModuleScope` discriminated union and dispatches
    inclusion via ``match`` on the scope variant (PPI-004/PPI-010).
    """
    scope = module_scope_of(
        all_modules=config.all_modules,
        module_prefixes=config.module_prefixes,
        include_modules=config.include_modules,
    )
    match scope:
        case AllModules():
            return True
        case PrefixScope() | IncludeScope() | PrefixAndIncludeScope():
            return scope.includes(module_name)
        case _:
            return True


def discover_modules(
    addons_paths: list[Path],
    config: ReportConfig,
) -> dict[str, ModuleInfo]:
    """Find all filtered Odoo modules under the given addons paths.

    Thin shell over the pure discovery stages (PPI-004/PPI-056): performs
    filesystem rglob + manifest reads (adapter effects), delegates candidate
    selection and duplicate resolution to typed pure functions, and parses
    manifests via :func:`ppi.core.odoo.manifest.parse_manifest_source` returning
    typed failures instead of a silent ``manifest = {}`` fallback. Warnings are
    printed to stderr here (shell); the pure stage returns them as
    :class:`DuplicateModuleWarning`/``ManifestParseFailure`` values.
    """
    from ppi.core.odoo.manifest import ManifestParseFailed  # local to avoid cycle

    scope = module_scope_of(
        all_modules=config.all_modules,
        module_prefixes=config.module_prefixes,
        include_modules=config.include_modules,
    )

    # Adapter: rglob manifests across all addons paths.
    manifest_paths: list[Path] = []
    for addons_path in addons_paths:
        manifest_paths.extend(sorted(addons_path.rglob("__manifest__.py")))

    # Pure: select candidates in scope.
    candidates = select_module_candidates(tuple(manifest_paths), scope)

    # Pure: resolve duplicates (KeepFirst policy, matching legacy behavior).
    kept_candidates, duplicate_warnings = resolve_duplicate_modules(candidates, KeepFirst())
    for warning in duplicate_warnings:
        print(
            f"[WARN] Duplicate module name {warning.module_name!r}: "
            f"keeping {warning.kept_path}, skipping {warning.skipped_path}",
            file=sys.stderr,
        )

    # Adapter + pure: read + parse each manifest, building ModuleInfo.
    modules: dict[str, ModuleInfo] = {}
    for candidate in kept_candidates:
        try:
            source = candidate.manifest_path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            print(f"[WARN] Failed to read {candidate.manifest_path}: {exc}", file=sys.stderr)
            source = ""

        parse_result = parse_manifest_source(source, origin=None)
        if parse_result.is_error():
            failure: ManifestParseFailed = parse_result.error  # type: ignore[union-attr]
            print(
                f"[WARN] Failed to parse {candidate.manifest_path}: {failure.message}",
                file=sys.stderr,
            )
            depends: set[str] = set()
        else:
            manifest = parse_result.default_value(None)  # type: ignore[union-attr]
            depends = {m.value for m in manifest.depends}  # type: ignore[union-attr]

        modules[candidate.module_name] = ModuleInfo(
            name=candidate.module_name,
            path=candidate.module_path,
            manifest_path=candidate.manifest_path,
            manifest_depends=depends,
        )

    return modules


def is_test_file(file_path: Path, module_path: Path) -> bool:
    """Check whether file path belongs to tests."""
    relative_parts = file_path.relative_to(module_path).parts
    file_name = file_path.name.lower()
    if "tests" in relative_parts or "__tests__" in relative_parts:
        return True
    if file_name.startswith("test_") or file_name.endswith("_test.py"):
        return True
    if file_name.endswith(".test.js") or file_name.endswith(".spec.js"):
        return True
    return False


def count_file_lines(file_path: Path) -> int:
    """Count physical lines in a text file."""
    with file_path.open("r", encoding="utf-8", errors="ignore") as file_obj:
        return sum(1 for _ in file_obj)


def classify_file(file_path: Path, module_path: Path) -> str | None:
    """Return line-category key for file path or None when not classified.

    Delegates to the pure :func:`ppi.core.odoo.file_classification.classify_relative_file`
    which dispatches by suffix via ``match`` (PPI-011/PPI-036) and returns a
    typed :class:`LineCategory`; the legacy string is exposed via ``.value`` for
    the storage/JSON boundary.
    """
    relative_path = file_path.relative_to(module_path).as_posix()
    category = classify_relative_file(relative_path)
    return category.value if category is not None else None


def analyze_module_code_size_for_module(module: ModuleInfo) -> ModuleInfo:
    """Count code-size metrics for one module without mutating input."""
    counters = dict.fromkeys(
        (category.value for category in LineCategory), 0
    )
    files: list[FileLineInfo] = []
    for file_path in sorted(module.path.rglob("*")):
        if not file_path.is_file():
            continue
        category = classify_file(file_path, module.path)
        if category is None:
            continue
        line_count = count_file_lines(file_path)
        counters[category] += line_count
        relative_path = file_path.relative_to(module.path).as_posix()
        files.append(
            FileLineInfo(
                relative_path=relative_path,
                lines=line_count,
                category=category,
            ),
        )
    return replace(
        module,
        files=files,
        total_lines=sum(counters.values()),
        **counters,
    )


def analyze_module_code_size(modules: dict[str, ModuleInfo]) -> dict[str, ModuleInfo]:
    """Count lines per category for each module and collect per-file metrics.

    Categories:
        python code: ``.py`` files outside tests folders.
        JS code: all ``.js`` files including ``.test.js`` and ``.spec.js``.
        python test: ``.py`` files detected as tests.
        xml view: all ``.xml`` files.
        css: ``.css``, ``.scss``, ``.less``, ``.sass`` files.
        html: ``.html`` files.
    """
    return dict(valmap(analyze_module_code_size_for_module, modules))


class JonesComplexityVisitor(ast.NodeVisitor):
    """Count AST nodes per physical source line."""

    def __init__(self) -> None:
        """Initialize per-line node counters."""
        self.line_nodes: dict[int, int] = defaultdict(int)

    def generic_visit(self, node: ast.AST) -> None:
        if not isinstance(node, (ast.Module, ast.Load, ast.Store, ast.Del, ast.expr_context)):
            line_no = getattr(node, "lineno", None)
            if isinstance(line_no, int) and line_no > 0:
                self.line_nodes[line_no] += 1
        super().generic_visit(node)


def iter_radon_function_blocks(blocks: Iterable[Any]) -> Iterable[Any]:
    """Yield radon function/method blocks, including nested closures and methods."""
    for block in blocks:
        if hasattr(block, "methods"):
            yield from iter_radon_function_blocks(getattr(block, "methods", []))
        if type(block).__name__ == "Function":
            yield block
            yield from iter_radon_function_blocks(getattr(block, "closures", []))


def collect_cyclomatic_scores(source: str) -> list[int]:
    """Collect per-function cyclomatic complexity scores via radon."""
    visitor = ComplexityVisitor.from_code(source)
    return [int(block.complexity) for block in iter_radon_function_blocks(visitor.blocks)]


def collect_cognitive_scores(source: str) -> list[int]:
    """Collect per-function cognitive complexity scores via complexipy."""
    code_metrics = complexipy.code_complexity(source)
    return [int(item.complexity) for item in code_metrics.functions]


def collect_jones_line_scores(tree: ast.AST) -> list[int]:
    """Collect AST-node counts per source line."""
    visitor = JonesComplexityVisitor()
    visitor.visit(tree)
    return [visitor.line_nodes[line_no] for line_no in sorted(visitor.line_nodes)]


def attach_file_complexity_to_line_info(
    file_infos: list[FileLineInfo],
    relative_path: str,
    metrics: ComplexityMetrics | None,
    parse_error: str | None,
) -> list[FileLineInfo]:
    """Attach complexity metadata to file line info immutably."""
    return [
        replace(file_info, complexity=metrics, parse_error=parse_error)
        if file_info.relative_path == relative_path
        else file_info
        for file_info in file_infos
    ]


def build_file_complexity_error_result(
    file_path: Path,
    relative_path: str,
    line_count: int,
    error: Exception,
    warning_label: str,
) -> FileComplexityAnalysisResult:
    """Build one parse/library error result for Python complexity."""
    print(
        f"[WARN] {warning_label} {file_path}: {error}",
        file=sys.stderr,
    )
    return FileComplexityAnalysisResult(
        file_complexity_info=FileComplexityInfo(
            relative_path=relative_path,
            lines=line_count,
            function_count=0,
            jones_line_count=0,
            complexity=ComplexityMetrics(),
            parse_error=str(error),
        ),
    )


def analyze_python_complexity_file(
    file_path: Path,
    module_path: Path,
) -> FileComplexityAnalysisResult:
    """Analyze complexity for one production Python file without side effects."""
    relative_path = file_path.relative_to(module_path).as_posix()
    line_count = count_file_lines(file_path)

    try:
        source = file_path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(file_path))
    except SyntaxError as exc:
        return build_file_complexity_error_result(
            file_path,
            relative_path,
            line_count,
            exc,
            "Invalid Python for complexity",
        )
    except UnicodeDecodeError as exc:
        return build_file_complexity_error_result(
            file_path,
            relative_path,
            line_count,
            exc,
            "Cannot decode Python for complexity",
        )

    try:
        function_scores_cc = tuple(collect_cyclomatic_scores(source))
        function_scores_cognitive = tuple(collect_cognitive_scores(source))
    except Exception as exc:  # noqa: BLE001
        return build_file_complexity_error_result(
            file_path,
            relative_path,
            line_count,
            exc,
            "Complexity library failure",
        )

    jones_values = tuple(collect_jones_line_scores(tree))
    file_metrics = ComplexityMetrics(
        cyclomatic=build_distribution_stats(function_scores_cc),
        cognitive=build_distribution_stats(function_scores_cognitive),
        jones=build_distribution_stats(jones_values),
    )
    return FileComplexityAnalysisResult(
        file_complexity_info=FileComplexityInfo(
            relative_path=relative_path,
            lines=line_count,
            function_count=len(function_scores_cc),
            jones_line_count=len(jones_values),
            complexity=file_metrics,
            parse_error=None,
        ),
        cyclomatic_values=function_scores_cc,
        cognitive_values=function_scores_cognitive,
        jones_values=jones_values,
    )


def analyze_python_complexity_for_module(module: ModuleInfo) -> ModuleInfo:
    """Analyze complexity of production Python files for one module immutably."""
    python_files = [
        file_path
        for file_path in sorted(module.path.rglob("*.py"))
        if file_path.name != "__manifest__.py" and not is_test_file(file_path, module.path)
    ]
    results = [analyze_python_complexity_file(file_path, module.path) for file_path in python_files]

    updated_files = module.files
    for result in results:
        updated_files = attach_file_complexity_to_line_info(
            updated_files,
            result.file_complexity_info.relative_path,
            result.file_complexity_info.complexity,
            result.file_complexity_info.parse_error,
        )

    cyclomatic_values = [value for result in results for value in result.cyclomatic_values]
    cognitive_values = [value for result in results for value in result.cognitive_values]
    jones_values = [value for result in results for value in result.jones_values]

    return replace(
        module,
        files=updated_files,
        python_complexity_files=[result.file_complexity_info for result in results],
        python_complexity_parse_errors=sum(
            1 for result in results if result.file_complexity_info.parse_error
        ),
        complexity=ComplexityMetrics(
            cyclomatic=build_distribution_stats(cyclomatic_values),
            cognitive=build_distribution_stats(cognitive_values),
            jones=build_distribution_stats(jones_values),
        ),
    )


def analyze_python_complexity(modules: dict[str, ModuleInfo]) -> dict[str, ModuleInfo]:
    """Analyze complexity of production Python files for each module."""
    return dict(valmap(analyze_python_complexity_for_module, modules))


def get_class_target_models(class_summary: ClassSummary) -> set[str]:
    """Return model names that receive fields defined in this class."""
    if class_summary.declared_models:
        return set(class_summary.declared_models)
    return set(class_summary.inherit_models)


def build_class_summary(
    class_node: ast.ClassDef,
    file_path: Path,
    global_relational_fields: dict[str, dict[str, str]],
) -> ClassSummary:
    """Build one class summary from AST ClassDef node."""
    class_summary = ClassSummary(file_path=file_path, class_name=class_node.name)

    for statement in class_node.body:
        assigned_targets: list[str] = []
        assigned_value: ast.AST | None = None

        if isinstance(statement, ast.Assign):
            assigned_targets = [
                target.id for target in statement.targets if isinstance(target, ast.Name)
            ]
            assigned_value = statement.value
        elif isinstance(statement, ast.AnnAssign) and isinstance(
            statement.target,
            ast.Name,
        ):
            assigned_targets = [statement.target.id]
            assigned_value = statement.value

        if assigned_targets:
            if "_name" in assigned_targets:
                class_summary.declared_models.update(extract_string_list(assigned_value))
            if "_inherit" in assigned_targets:
                inherit_values = extract_string_list(assigned_value)
                class_summary.inherit_models.update(inherit_values)
                inherit_line = getattr(statement, "lineno", 0)
                for inherit_model in inherit_values:
                    class_summary.inherit_links.append((inherit_model, inherit_line))

        class_summary.model_names = set(class_summary.declared_models) or set(
            class_summary.inherit_models,
        )

        if not assigned_targets or assigned_value is None:
            continue

        field_name = assigned_targets[0]
        if not isinstance(assigned_value, ast.Call):
            continue
        if not isinstance(assigned_value.func, ast.Attribute):
            continue
        if not isinstance(assigned_value.func.value, ast.Name):
            continue
        if assigned_value.func.value.id != "fields":
            continue

        field_type = assigned_value.func.attr
        comodel_name = None
        related_path = None

        if field_type in RELATIONAL_FIELD_TYPES:
            if assigned_value.args:
                comodel_name = extract_string_literal(assigned_value.args[0])
            if comodel_name is None:
                for keyword in assigned_value.keywords:
                    if keyword.arg == "comodel_name":
                        comodel_name = extract_string_literal(keyword.value)
                        break
            if comodel_name:
                class_summary.field_models[field_name] = comodel_name
                class_summary.declared_field_models[field_name] = comodel_name
                kind_enum = edge_kind_for_relational_field(field_type)
                kind = kind_enum.value if kind_enum is not None else f"python_{field_type.lower()}"
                line = getattr(statement, "lineno", 0)
                detail = f"{field_name} -> {comodel_name}"
                class_summary.field_links.append((kind, comodel_name, line, detail))

        for keyword in assigned_value.keywords:
            if keyword.arg == "related":
                related_path = extract_string_literal(keyword.value)
                break
        if related_path:
            line = getattr(statement, "lineno", 0)
            class_summary.related_paths.append((related_path, line, field_name))

    inherited_field_models: dict[str, str] = {}
    for model_name in class_summary.model_names:
        inherited_field_models.update(global_relational_fields.get(model_name, {}))
    if inherited_field_models:
        inherited_field_models.update(class_summary.field_models)
        class_summary.field_models = inherited_field_models

    for statement in class_node.body:
        if not isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        class_summary.declared_methods.add(statement.name)

        for decorator in statement.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            if not isinstance(decorator.func, ast.Attribute):
                continue
            if not (
                isinstance(decorator.func.value, ast.Name) and decorator.func.value.id == "api"
            ):
                continue

            decorator_targets = {
                "depends": class_summary.depends_paths,
                "onchange": class_summary.onchange_paths,
                "constrains": class_summary.constrains_paths,
            }
            target_list = decorator_targets.get(decorator.func.attr)
            if target_list is None:
                continue

            line = getattr(decorator, "lineno", 0)
            for argument in decorator.args:
                for field_path in extract_string_list(argument):
                    target_list.append((field_path, line, statement.name))

        method_analyzer = MethodAnalyzer(
            class_summary=class_summary,
            global_relational_fields=global_relational_fields,
        )
        method_analyzer.visit(statement)
        class_summary.env_accesses.extend(method_analyzer.env_accesses)
        class_summary.method_calls.extend(method_analyzer.method_calls)
        class_summary.field_property_accesses.extend(
            method_analyzer.field_property_accesses,
        )

    return class_summary


def analyze_python_file(
    file_path: Path,
    global_relational_fields: dict[str, dict[str, str]],
) -> list[ClassSummary]:
    """Analyze one Python file and return class summaries."""
    source = file_path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(file_path))
    class_summaries: list[ClassSummary] = []

    for statement in tree.body:
        if isinstance(statement, ast.ClassDef):
            class_summaries.append(
                build_class_summary(statement, file_path, global_relational_fields),
            )

    return class_summaries


def analyze_python_modules(modules: dict[str, ModuleInfo]) -> dict[str, ModuleInfo]:
    """Load and analyze Python files for each module (pure: returns new dict).

    Unlike the legacy in-place version, this builds new :class:`ModuleInfo`
    instances via ``replace`` so the caller's input is not mutated. Each module
    gets fresh ``class_summaries``/``declared_models``/``inherited_models``
    collections; the shared ``global_relational_fields`` map is still built
    iteratively across modules (it is a local builder, not part of the public
    result).
    """
    global_relational_fields: dict[str, dict[str, str]] = defaultdict(dict)
    result: dict[str, ModuleInfo] = {}

    for module_name in sorted(modules):
        module = modules[module_name]
        new_class_summaries: list[ClassSummary] = list(module.class_summaries)

        for file_path in sorted(module.path.rglob("*.py")):
            if file_path.name == "__manifest__.py":
                continue
            try:
                class_summaries = analyze_python_file(
                    file_path=file_path,
                    global_relational_fields=global_relational_fields,
                )
            except SyntaxError as exc:
                print(f"[WARN] Invalid Python {file_path}: {exc}", file=sys.stderr)
                continue
            except UnicodeDecodeError as exc:
                print(f"[WARN] Cannot decode Python {file_path}: {exc}", file=sys.stderr)
                continue
            new_class_summaries.extend(class_summaries)

            for class_summary in class_summaries:
                for target_model in get_class_target_models(class_summary):
                    for field_name, comodel_name in class_summary.field_models.items():
                        global_relational_fields[target_model][field_name] = comodel_name

        declared_models: set[str] = set(module.declared_models)
        inherited_models: set[str] = set(module.inherited_models)
        for class_summary in new_class_summaries:
            declared_models.update(
                model_name
                for model_name in class_summary.declared_models
                if model_name not in class_summary.inherit_models
            )
            inherited_models.update(class_summary.inherit_models)

        result[module_name] = replace(
            module,
            class_summaries=new_class_summaries,
            declared_models=declared_models,
            inherited_models=inherited_models,
        )

    return result


def find_external_ids(text: str) -> list[str]:
    """Extract external identifiers from text."""
    return [match.group(1) for match in EXTERNAL_ID_RE.finditer(text)]


def resolve_related_model(path: str, field_models: dict[str, str]) -> str | None:
    """Resolve related/depends root field to comodel."""
    root_field = path.split(".", 1)[0]
    return field_models.get(root_field)


def add_model_links(
    edges: dict[tuple[str, str], CouplingEdgeAccumulator],
    modules: dict[str, ModuleInfo],
    model_owners: dict[str, set[str]],
    source_module: str,
    model_name: str,
    kind: str,
    file_path: Path,
    line: int,
    detail: str,
) -> None:
    """Add links from source module to each owner of model_name."""
    for target_module in sorted(model_owners.get(model_name, set())):
        if target_module == source_module or target_module not in modules:
            continue
        edge_key = (source_module, target_module)
        edge = edges.setdefault(
            edge_key,
            CouplingEdgeAccumulator(source_module=source_module, target_module=target_module),
        )
        edge.add(kind=kind, file_path=file_path, line=line, detail=detail)


def add_module_links(
    edges: dict[tuple[str, str], CouplingEdgeAccumulator],
    modules: dict[str, ModuleInfo],
    source_module: str,
    target_modules: set[str],
    kind: str,
    file_path: Path,
    line: int,
    detail: str,
) -> None:
    """Add links from source to explicit target modules."""
    for target_module in sorted(target_modules):
        if target_module == source_module or target_module not in modules:
            continue
        edge_key = (source_module, target_module)
        edge = edges.setdefault(
            edge_key,
            CouplingEdgeAccumulator(source_module=source_module, target_module=target_module),
        )
        edge.add(kind=kind, file_path=file_path, line=line, detail=detail)


def build_field_providers(
    modules: dict[str, ModuleInfo],
) -> dict[tuple[str, str], set[str]]:
    """Build map of (model, field) -> provider modules."""
    providers: dict[tuple[str, str], set[str]] = defaultdict(set)
    for module in modules.values():
        for class_summary in module.class_summaries:
            target_models = get_class_target_models(class_summary)
            for model_name in target_models:
                for field_name in class_summary.declared_field_models:
                    providers[(model_name, field_name)].add(module.name)
    return providers


def build_method_providers(
    modules: dict[str, ModuleInfo],
) -> dict[tuple[str, str], set[str]]:
    """Build map of (model, method) -> provider modules."""
    providers: dict[tuple[str, str], set[str]] = defaultdict(set)
    for module in modules.values():
        for class_summary in module.class_summaries:
            target_models = get_class_target_models(class_summary)
            for model_name in target_models:
                for method_name in class_summary.declared_methods:
                    providers[(model_name, method_name)].add(module.name)
    return providers


def analyze_python_links(
    modules: dict[str, ModuleInfo],
    model_owners: dict[str, set[str]],
    field_providers: dict[tuple[str, str], set[str]],
    method_providers: dict[tuple[str, str], set[str]],
    edges: dict[tuple[str, str], CouplingEdgeAccumulator],
) -> None:
    """Build coupling links from Python analysis."""
    for module in modules.values():
        for class_summary in module.class_summaries:
            for inherited_model, inherit_line in class_summary.inherit_links:
                add_model_links(
                    edges=edges,
                    modules=modules,
                    model_owners=model_owners,
                    source_module=module.name,
                    model_name=inherited_model,
                    kind=EdgeKind.PYTHON_INHERIT.value,
                    file_path=class_summary.file_path,
                    line=inherit_line,
                    detail=f"_inherit -> {inherited_model}",
                )

            for kind, comodel_name, line, detail in class_summary.field_links:
                add_model_links(
                    edges=edges,
                    modules=modules,
                    model_owners=model_owners,
                    source_module=module.name,
                    model_name=comodel_name,
                    kind=kind,
                    file_path=class_summary.file_path,
                    line=line,
                    detail=detail,
                )

            for related_path, line, field_name in class_summary.related_paths:
                model_name = resolve_related_model(related_path, class_summary.field_models)
                if not model_name:
                    continue
                add_model_links(
                    edges=edges,
                    modules=modules,
                    model_owners=model_owners,
                    source_module=module.name,
                    model_name=model_name,
                    kind=EdgeKind.PYTHON_RELATED.value,
                    file_path=class_summary.file_path,
                    line=line,
                    detail=f"related={related_path} ({field_name})",
                )

            for depends_path, line, method_name in class_summary.depends_paths:
                model_name = resolve_related_model(depends_path, class_summary.field_models)
                if not model_name:
                    continue
                add_model_links(
                    edges=edges,
                    modules=modules,
                    model_owners=model_owners,
                    source_module=module.name,
                    model_name=model_name,
                    kind=EdgeKind.PYTHON_API_DEPENDS.value,
                    file_path=class_summary.file_path,
                    line=line,
                    detail=f"@api.depends('{depends_path}') in {method_name}",
                )

            for onchange_path, line, method_name in class_summary.onchange_paths:
                model_name = resolve_related_model(onchange_path, class_summary.field_models)
                if not model_name:
                    continue
                add_model_links(
                    edges=edges,
                    modules=modules,
                    model_owners=model_owners,
                    source_module=module.name,
                    model_name=model_name,
                    kind=EdgeKind.PYTHON_API_ONCHANGE.value,
                    file_path=class_summary.file_path,
                    line=line,
                    detail=f"@api.onchange('{onchange_path}') in {method_name}",
                )

            for constrains_path, line, method_name in class_summary.constrains_paths:
                model_name = resolve_related_model(constrains_path, class_summary.field_models)
                if not model_name:
                    continue
                add_model_links(
                    edges=edges,
                    modules=modules,
                    model_owners=model_owners,
                    source_module=module.name,
                    model_name=model_name,
                    kind=EdgeKind.PYTHON_API_CONSTRAINS.value,
                    file_path=class_summary.file_path,
                    line=line,
                    detail=f"@api.constrains('{constrains_path}') in {method_name}",
                )

            for model_name, line in class_summary.env_accesses:
                add_model_links(
                    edges=edges,
                    modules=modules,
                    model_owners=model_owners,
                    source_module=module.name,
                    model_name=model_name,
                    kind=EdgeKind.PYTHON_ENV_MODEL.value,
                    file_path=class_summary.file_path,
                    line=line,
                    detail=f"self.env['{model_name}'] access",
                )

            for model_name, method_name, line in class_summary.method_calls:
                kind = (
                    EdgeKind.PYTHON_PRIVATE_METHOD_CALL.value
                    if method_name.startswith("_")
                    else EdgeKind.PYTHON_METHOD_CALL.value
                )
                providers = method_providers.get((model_name, method_name), set())
                add_module_links(
                    edges=edges,
                    modules=modules,
                    source_module=module.name,
                    target_modules=providers,
                    kind=kind,
                    file_path=class_summary.file_path,
                    line=line,
                    detail=f"{model_name}.{method_name}()",
                )

            for model_name, field_name, line in class_summary.field_property_accesses:
                providers = field_providers.get((model_name, field_name), set())
                add_module_links(
                    edges=edges,
                    modules=modules,
                    source_module=module.name,
                    target_modules=providers,
                    kind=EdgeKind.PYTHON_FIELD_PROPERTY_ACCESS.value,
                    file_path=class_summary.file_path,
                    line=line,
                    detail=f"{model_name}.{field_name} access",
                )


def analyze_xml_file(
    file_path: Path,
    source_module: str,
    modules: dict[str, ModuleInfo],
    edges: dict[tuple[str, str], CouplingEdgeAccumulator],
) -> None:
    """Analyze one XML file and add coupling edges by external references."""
    text = file_path.read_text(encoding="utf-8")
    security_file = "security" in file_path.parts
    snippet_offsets: dict[str, int] = defaultdict(int)

    def resolve_line_from_snippet(snippet: str, fallback_line: int = 0) -> int:
        """Resolve line number by searching snippet in source XML text."""
        if not snippet:
            return fallback_line
        start = snippet_offsets.get(snippet, 0)
        index = text.find(snippet, start)
        if index == -1:
            index = text.find(snippet)
            if index == -1:
                return fallback_line
        snippet_offsets[snippet] = index + len(snippet)
        return text.count("\n", 0, index) + 1

    for match in PERCENT_EXTERNAL_ID_RE.finditer(text):
        xml_id = match.group(1)
        target_module = xml_id.split(".", 1)[0]
        if target_module == source_module or target_module not in modules:
            continue
        edge = edges.setdefault(
            (source_module, target_module),
            CouplingEdgeAccumulator(source_module=source_module, target_module=target_module),
        )
        line = text.count("\n", 0, match.start()) + 1
        edge.add(
            kind=EdgeKind.XML_PERCENT_REF.value,
            file_path=file_path,
            line=line,
            detail=f"%({xml_id})d",
        )

    try:
        root = ElementTree.fromstring(text)
    except ElementTree.ParseError as exc:
        print(f"[WARN] Invalid XML {file_path}: {exc}", file=sys.stderr)
        return

    def traverse(element: ElementTree.Element, record_model: str | None = None) -> None:
        """Traverse XML nodes and collect coupling evidence."""
        current_record_model = record_model
        if local_tag_name(element.tag) == "record":
            current_record_model = element.attrib.get("model")

        if local_tag_name(element.tag) == "field":
            field_name = element.attrib.get("name")
            field_ref = element.attrib.get("ref")
            field_text = (element.text or "").strip()
            xml_id = field_ref or field_text
            line = getattr(element, "sourceline", 0) or 0

            if field_name == "inherit_id" and "." in xml_id:
                target_module = xml_id.split(".", 1)[0]
                if target_module != source_module and target_module in modules:
                    line = resolve_line_from_snippet(xml_id, line)
                    edge = edges.setdefault(
                        (source_module, target_module),
                        CouplingEdgeAccumulator(
                            source_module=source_module,
                            target_module=target_module,
                        ),
                    )
                    edge.add(
                        kind=EdgeKind.XML_INHERIT_ID.value,
                        file_path=file_path,
                        line=line,
                        detail=f"inherit_id -> {xml_id}",
                    )

            if current_record_model == "ir.rule" and field_name == "model_id" and "." in xml_id:
                target_module = xml_id.split(".", 1)[0]
                if target_module != source_module and target_module in modules:
                    line = resolve_line_from_snippet(xml_id, line)
                    edge = edges.setdefault(
                        (source_module, target_module),
                        CouplingEdgeAccumulator(
                            source_module=source_module,
                            target_module=target_module,
                        ),
                    )
                    edge.add(
                        kind=EdgeKind.SECURITY_IR_RULE_MODEL_REF.value,
                        file_path=file_path,
                        line=line,
                        detail=f"ir.rule model_id -> {xml_id}",
                    )

        ref_value = element.attrib.get("ref")
        if ref_value and "." in ref_value:
            target_module = ref_value.split(".", 1)[0]
            if target_module != source_module and target_module in modules:
                if current_record_model == "ir.rule":
                    kind = EdgeKind.SECURITY_IR_RULE_REF.value
                elif security_file:
                    kind = EdgeKind.SECURITY_XML_REF.value
                else:
                    kind = EdgeKind.XML_REF.value
                edge = edges.setdefault(
                    (source_module, target_module),
                    CouplingEdgeAccumulator(
                        source_module=source_module,
                        target_module=target_module,
                    ),
                )
                line = getattr(element, "sourceline", 0) or 0
                line = resolve_line_from_snippet(ref_value, line)
                edge.add(
                    kind=kind,
                    file_path=file_path,
                    line=line,
                    detail=f"ref -> {ref_value}",
                )

        for child in element:
            traverse(child, current_record_model)

    traverse(root)


def analyze_security_csv(
    file_path: Path,
    source_module: str,
    modules: dict[str, ModuleInfo],
    edges: dict[tuple[str, str], CouplingEdgeAccumulator],
) -> None:
    """Analyze security CSV and collect module external-id references."""
    with file_path.open("r", encoding="utf-8", newline="") as file_obj:
        reader = csv.DictReader(file_obj)
        for row_index, row in enumerate(reader, start=2):
            for value in row.values():
                if not value:
                    continue
                for xml_id in find_external_ids(value):
                    target_module = xml_id.split(".", 1)[0]
                    if target_module == source_module or target_module not in modules:
                        continue
                    edge = edges.setdefault(
                        (source_module, target_module),
                        CouplingEdgeAccumulator(
                            source_module=source_module,
                            target_module=target_module,
                        ),
                    )
                    edge.add(
                        kind=EdgeKind.SECURITY_CSV_REF.value,
                        file_path=file_path,
                        line=row_index,
                        detail=f"security csv ref -> {xml_id}",
                    )


def analyze_xml_links(
    modules: dict[str, ModuleInfo],
    edges: dict[tuple[str, str], CouplingEdgeAccumulator],
) -> None:
    """Analyze XML/CSV links between modules."""
    for module in modules.values():
        for xml_path in sorted(module.path.rglob("*.xml")):
            try:
                analyze_xml_file(
                    file_path=xml_path,
                    source_module=module.name,
                    modules=modules,
                    edges=edges,
                )
            except UnicodeDecodeError as exc:
                print(f"[WARN] Cannot decode XML {xml_path}: {exc}", file=sys.stderr)

        security_dir = module.path / "security"
        if not security_dir.exists():
            continue
        for csv_path in sorted(security_dir.rglob("*.csv")):
            try:
                analyze_security_csv(
                    file_path=csv_path,
                    source_module=module.name,
                    modules=modules,
                    edges=edges,
                )
            except UnicodeDecodeError as exc:
                print(f"[WARN] Cannot decode CSV {csv_path}: {exc}", file=sys.stderr)


def add_manifest_links(
    modules: dict[str, ModuleInfo],
    edges: dict[tuple[str, str], CouplingEdgeAccumulator],
) -> None:
    """Add coupling edges from manifest depends entries."""
    for module in modules.values():
        for dependency in sorted(module.manifest_depends):
            if dependency == module.name or dependency not in modules:
                continue
            edge = edges.setdefault(
                (module.name, dependency),
                CouplingEdgeAccumulator(source_module=module.name, target_module=dependency),
            )
            edge.add(
                kind=EdgeKind.MANIFEST_DEPENDS.value,
                file_path=module.manifest_path,
                line=0,
                detail=f"depends -> {dependency}",
            )


def build_model_owners(modules: dict[str, ModuleInfo]) -> dict[str, set[str]]:
    """Build map model_name -> owner modules from local model declarations.

    Only models explicitly declared in analyzed modules (`_name` not equal to
    `_inherit`) are treated as owners. This avoids counting pure shared usage
    of Odoo core models as cross-module coupling.
    """
    owners: dict[str, set[str]] = defaultdict(set)
    for module in modules.values():
        for model_name in module.declared_models:
            owners[model_name].add(module.name)
    return owners
