"""Odoo module analysis pipeline."""

from __future__ import annotations

import ast
import csv
import math
import re
import statistics
import sys
from collections import Counter, defaultdict
from copy import deepcopy
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree

import complexipy
from radon.visitors import ComplexityVisitor
from toolz import curry, pipe, valmap

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
GRAPH_MODEL_REUSE_KINDS = {
    "python_many2one",
    "python_one2many",
    "python_many2many",
    "python_related",
    "python_api_depends",
    "python_api_onchange",
    "python_api_constrains",
    "python_env_model",
    "security_ir_rule_model_ref",
}
GRAPH_FIELD_PROPERTY_KINDS = {
    "python_field_property_access",
}
GRAPH_EXTENSION_METHOD_KINDS = {
    "python__inherit",
    "python_method_call",
    "python_private_method_call",
}
GRAPH_VIEW_KINDS = {
    "xml_inherit_id",
    "xml_ref",
    "xml_percent_ref",
}

LINE_CATEGORY_KEYS = (
    "python_lines",
    "js_lines",
    "python_test_lines",
    "xml_lines",
    "css_lines",
    "html_lines",
)
CSS_FILE_SUFFIXES = {".css", ".scss", ".less", ".sass"}


@dataclass(slots=True)
class CouplingEdge:
    """Store all evidence for a source-target module pair."""

    source_module: str
    target_module: str
    kind_counter: Counter = field(default_factory=Counter)

    def add(self, kind: str, file_path: Path, line: int, detail: str) -> None:
        """Add one evidence item to the edge."""
        del file_path, line, detail
        self.kind_counter[kind] += 1

    @property
    def score(self) -> int:
        """Compute graph points for this edge."""
        return edge_score(self)


@dataclass(slots=True)
class FileLineInfo:
    """Store per-file line metrics."""

    relative_path: str
    lines: int
    category: str
    complexity: ComplexityMetrics | None = None
    parse_error: str | None = None


@dataclass(slots=True)
class DistributionStats:
    """Store distribution summary for one metric."""

    count: int = 0
    mean: float = 0.0
    median: float = 0.0
    p95: float = 0.0
    max: float = 0.0


@dataclass(slots=True)
class ComplexityMetrics:
    """Store aggregated complexity metrics."""

    cyclomatic: DistributionStats = field(default_factory=DistributionStats)
    cognitive: DistributionStats = field(default_factory=DistributionStats)
    jones: DistributionStats = field(default_factory=DistributionStats)


@dataclass(slots=True)
class FileComplexityInfo:
    """Store complexity metrics for one production Python file."""

    relative_path: str
    lines: int
    function_count: int
    jones_line_count: int
    complexity: ComplexityMetrics
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
        return {key: getattr(self, key) for key in LINE_CATEGORY_KEYS}


@dataclass(slots=True)
class ReportConfig:
    """Store configurable report settings."""

    project_label: str
    module_prefixes: tuple[str, ...] = ()
    include_modules: tuple[str, ...] = ()
    all_modules: bool = False


@dataclass(frozen=True, slots=True)
class AnalysisArtifacts:
    """Carry the main analysis pipeline state between pure-ish steps."""

    addons_paths: tuple[Path, ...]
    config: ReportConfig
    modules: dict[str, ModuleInfo]
    model_owners: dict[str, set[str]] = field(default_factory=dict)
    field_providers: dict[tuple[str, str], set[str]] = field(default_factory=dict)
    method_providers: dict[tuple[str, str], set[str]] = field(default_factory=dict)
    edges: dict[tuple[str, str], CouplingEdge] = field(default_factory=dict)
    module_scores: dict[str, dict[str, int]] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class FileComplexityAnalysisResult:
    """Store pure analysis result for one Python file complexity pass."""

    file_complexity_info: FileComplexityInfo
    cyclomatic_values: tuple[int, ...] = ()
    cognitive_values: tuple[int, ...] = ()
    jones_values: tuple[int, ...] = ()


def build_distribution_stats(values: Iterable[int | float]) -> DistributionStats:
    """Build count/mean/median/p95/max summary from raw values."""
    values_list = list(values)
    if not values_list:
        return DistributionStats()

    sorted_values = sorted(values_list)
    index = max(0, math.ceil(0.95 * len(sorted_values)) - 1)
    return DistributionStats(
        count=len(values_list),
        mean=float(statistics.mean(values_list)),
        median=float(statistics.median(values_list)),
        p95=float(sorted_values[index]),
        max=float(max(values_list)),
    )


def edge_score(edge: CouplingEdge) -> int:
    """Compute graph points according to custom coupling formula."""
    model_reuse = sum(
        count
        for kind, count in edge.kind_counter.items()
        if kind in GRAPH_MODEL_REUSE_KINDS
    )
    extension_or_method = sum(
        count
        for kind, count in edge.kind_counter.items()
        if kind in GRAPH_EXTENSION_METHOD_KINDS
    )
    view_points = sum(
        count
        for kind, count in edge.kind_counter.items()
        if kind in GRAPH_VIEW_KINDS
    )
    field_property = sum(
        count
        for kind, count in edge.kind_counter.items()
        if kind in GRAPH_FIELD_PROPERTY_KINDS
    )
    return model_reuse + extension_or_method + view_points + field_property


class MethodAnalyzer(ast.NodeVisitor):
    """Extract env access and method call links inside one Python method."""

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

    def _extract_target_names(self, node: ast.AST | None) -> list[str]:
        """Extract assigned variable names from assignment target."""
        if node is None:
            return []
        if isinstance(node, ast.Name):
            return [node.id]
        if isinstance(node, (ast.Tuple, ast.List)):
            names: list[str] = []
            for child in node.elts:
                names.extend(self._extract_target_names(child))
            return names
        if isinstance(node, ast.Starred):
            return self._extract_target_names(node.value)
        return []

    def _register_aliases(self, target: ast.AST | None, model_name: str | None) -> None:
        """Register model aliases on assignment-like operations."""
        if not model_name:
            return
        for target_name in self._extract_target_names(target):
            self.model_aliases[target_name] = model_name

    def visit_Assign(self, node: ast.Assign) -> None:
        """Track aliases for env object and model recordsets."""
        target_names: list[str] = []
        for target in node.targets:
            target_names.extend(self._extract_target_names(target))
        if target_names and self._is_env_object(node.value):
            self.env_aliases.update(target_names)

        model_name = self._resolve_model_expr(node.value)
        if target_names and model_name:
            for target in node.targets:
                self._register_aliases(target, model_name)

        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        """Track aliases from annotated assignments."""
        if not isinstance(node.target, ast.Name) or node.value is None:
            self.generic_visit(node)
            return

        if self._is_env_object(node.value):
            self.env_aliases.add(node.target.id)

        self._register_aliases(node.target, self._resolve_model_expr(node.value))

        self.generic_visit(node)

    def visit_For(self, node: ast.For) -> None:
        """Track aliases introduced by for-loop targets."""
        self._register_aliases(node.target, self._resolve_model_expr(node.iter))
        self.generic_visit(node)

    def visit_AsyncFor(self, node: ast.AsyncFor) -> None:
        """Track aliases introduced by async-for targets."""
        self._register_aliases(node.target, self._resolve_model_expr(node.iter))
        self.generic_visit(node)

    def visit_With(self, node: ast.With) -> None:
        """Track aliases introduced by with-context managers."""
        for item in node.items:
            self._register_aliases(
                item.optional_vars,
                self._resolve_model_expr(item.context_expr),
            )
        self.generic_visit(node)

    def visit_AsyncWith(self, node: ast.AsyncWith) -> None:
        """Track aliases introduced by async-with context managers."""
        for item in node.items:
            self._register_aliases(
                item.optional_vars,
                self._resolve_model_expr(item.context_expr),
            )
        self.generic_visit(node)

    def visit_NamedExpr(self, node: ast.NamedExpr) -> None:
        """Track aliases from walrus operator."""
        self._register_aliases(node.target, self._resolve_model_expr(node.value))
        self.generic_visit(node)

    def visit_Subscript(self, node: ast.Subscript) -> None:
        """Capture direct model access patterns via env[...] syntax."""
        model_name = self._extract_env_subscript_model(node)
        if model_name:
            self.env_accesses.append((model_name, getattr(node, "lineno", 0)))
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        """Capture method calls on model recordsets."""
        if isinstance(node.func, ast.Attribute):
            model_name = self._resolve_model_expr(node.func.value)
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

        model_name = self._resolve_model_expr(node.value)
        if model_name:
            self.field_property_accesses.append(
                (model_name, node.attr, getattr(node, "lineno", 0)),
            )
        self.generic_visit(node)

    def _is_env_object(self, node: ast.AST) -> bool:
        """Check if AST node points to self.env or its alias."""
        if isinstance(node, ast.Attribute):
            return (
                isinstance(node.value, ast.Name)
                and node.value.id == "self"
                and node.attr == "env"
            )
        return isinstance(node, ast.Name) and node.id in self.env_aliases

    def _extract_env_subscript_model(self, node: ast.AST) -> str | None:
        """Extract model from self.env['model.name'] access."""
        if not isinstance(node, ast.Subscript) or not self._is_env_object(node.value):
            return None
        return extract_string_literal(node.slice)

    def _get_relational_comodel(self, model_name: str, field_name: str) -> str | None:
        """Return comodel for relational field when known."""
        return self.global_relational_fields.get(model_name, {}).get(field_name)

    def _resolve_model_expr(self, node: ast.AST) -> str | None:
        """Resolve model name from recordset expression."""
        if model_name := self._extract_env_subscript_model(node):
            return model_name

        if isinstance(node, ast.Name):
            if model_name := self.model_aliases.get(node.id):
                return model_name
            if node.id == "self" and len(self.class_summary.model_names) == 1:
                return next(iter(self.class_summary.model_names))
            return None

        if isinstance(node, ast.Attribute):
            base_model_name = self._resolve_model_expr(node.value)
            if base_model_name:
                if comodel_name := self._get_relational_comodel(base_model_name, node.attr):
                    return comodel_name
                return base_model_name
            return None

        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in RECORDSET_CHAIN_METHODS:
                return self._resolve_model_expr(node.func.value)
            return None
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "super"
            and len(self.class_summary.model_names) == 1
        ):
            return next(iter(self.class_summary.model_names))

        return None


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


def validate_addons_paths(addons_paths: tuple[Path, ...]) -> tuple[Path, ...]:
    """Validate that every addons path is an existing directory."""
    invalid_paths = [path for path in addons_paths if not path.is_dir()]
    if invalid_paths:
        raise ValueError(
            "\n".join(f"Path must be a directory: {path}" for path in invalid_paths),
        )
    return addons_paths


@curry
def discover_analysis_artifacts(
    config: ReportConfig,
    addons_paths: tuple[Path, ...],
) -> AnalysisArtifacts:
    """Discover filtered modules and initialize analysis state."""
    modules = discover_modules(list(addons_paths), config)
    if not modules:
        raise ValueError("No matching Odoo modules found.")
    return AnalysisArtifacts(
        addons_paths=addons_paths,
        config=config,
        modules=modules,
    )


def enrich_modules_with_code_analysis(artifacts: AnalysisArtifacts) -> AnalysisArtifacts:
    """Run module analyzers and return updated pipeline state."""
    modules = deepcopy(
        pipe(
            artifacts.modules,
            analyze_module_code_size,
            analyze_python_complexity,
        ),
    )
    analyze_python_modules(modules)
    return replace(artifacts, modules=modules)


def attach_provider_maps(artifacts: AnalysisArtifacts) -> AnalysisArtifacts:
    """Build owner/provider indexes from analyzed modules."""
    return replace(
        artifacts,
        model_owners=build_model_owners(artifacts.modules),
        field_providers=build_field_providers(artifacts.modules),
        method_providers=build_method_providers(artifacts.modules),
    )


def attach_edges_and_scores(artifacts: AnalysisArtifacts) -> AnalysisArtifacts:
    """Build cross-module edges and score aggregates."""
    edges: dict[tuple[str, str], CouplingEdge] = {}
    add_manifest_links(artifacts.modules, edges)
    analyze_python_links(
        modules=artifacts.modules,
        model_owners=artifacts.model_owners,
        field_providers=artifacts.field_providers,
        method_providers=artifacts.method_providers,
        edges=edges,
    )
    analyze_xml_links(artifacts.modules, edges)
    return replace(
        artifacts,
        edges=edges,
        module_scores=build_module_scores(artifacts.modules, edges),
    )


def extract_string_literal(node: ast.AST | None) -> str | None:
    """Extract string value from AST literal when possible."""
    if node is None:
        return None
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def extract_string_list(node: ast.AST | None) -> list[str]:
    """Extract one or many string literals from AST node."""
    if node is None:
        return []
    if literal := extract_string_literal(node):
        return [literal]
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return [
            item
            for child in node.elts
            if (item := extract_string_literal(child))
        ]
    return []


def local_tag_name(tag: str) -> str:
    """Return XML local tag name without namespace."""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def parse_manifest(path: Path) -> dict[str, Any]:
    """Parse __manifest__.py safely with AST/literal_eval."""
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))

    for node in tree.body:
        candidate: ast.AST | None = None
        if isinstance(node, ast.Expr):
            candidate = node.value
        elif isinstance(node, ast.Assign):
            target_ids = {
                target.id for target in node.targets if isinstance(target, ast.Name)
            }
            if {"manifest", "__manifest__"} & target_ids:
                candidate = node.value
        if candidate is None:
            continue
        try:
            value = ast.literal_eval(candidate)
        except (SyntaxError, ValueError):
            continue
        if isinstance(value, dict):
            return value

    raise ValueError("Unable to parse manifest dictionary.")


def module_matches_filter(module_name: str, config: ReportConfig) -> bool:
    """Check whether module should be included according to CLI filter settings."""
    if config.all_modules:
        return True
    if not config.module_prefixes and not config.include_modules:
        return True
    if module_name in config.include_modules:
        return True
    return any(module_name.startswith(prefix) for prefix in config.module_prefixes)


def discover_modules(
    addons_paths: list[Path],
    config: ReportConfig,
) -> dict[str, ModuleInfo]:
    """Find all filtered Odoo modules under the given addons paths."""
    modules: dict[str, ModuleInfo] = {}

    for addons_path in addons_paths:
        for manifest_path in sorted(addons_path.rglob("__manifest__.py")):
            module_path = manifest_path.parent
            module_name = module_path.name
            if not module_matches_filter(module_name, config):
                continue
            if module_name in modules:
                existing_path = modules[module_name].path
                if existing_path != module_path:
                    print(
                        "[WARN] Duplicate module name "
                        f"{module_name!r}: keeping {existing_path}, skipping {module_path}",
                        file=sys.stderr,
                    )
                continue

            try:
                manifest = parse_manifest(manifest_path)
            except Exception as exc:  # noqa: BLE001
                print(
                    f"[WARN] Failed to parse {manifest_path}: {exc}",
                    file=sys.stderr,
                )
                manifest = {}

            depends = {
                dependency
                for dependency in manifest.get("depends", [])
                if isinstance(dependency, str)
            }
            modules[module_name] = ModuleInfo(
                name=module_name,
                path=module_path,
                manifest_path=manifest_path,
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
    """Return line-category key for file path or None when not classified."""
    suffix = file_path.suffix.lower()
    if suffix == ".py":
        return "python_test_lines" if is_test_file(file_path, module_path) else "python_lines"
    if suffix == ".js":
        return "js_lines"
    if suffix == ".xml":
        return "xml_lines"
    if suffix in CSS_FILE_SUFFIXES:
        return "css_lines"
    if suffix == ".html":
        return "html_lines"
    return None


def analyze_module_code_size_for_module(module: ModuleInfo) -> ModuleInfo:
    """Count code-size metrics for one module without mutating input."""
    counters = dict.fromkeys(LINE_CATEGORY_KEYS, 0)
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
    return [
        int(block.complexity)
        for block in iter_radon_function_blocks(visitor.blocks)
    ]


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
        if file_path.name != "__manifest__.py"
        and not is_test_file(file_path, module.path)
    ]
    results = [
        analyze_python_complexity_file(file_path, module.path)
        for file_path in python_files
    ]

    updated_files = module.files
    for result in results:
        updated_files = attach_file_complexity_to_line_info(
            updated_files,
            result.file_complexity_info.relative_path,
            result.file_complexity_info.complexity,
            result.file_complexity_info.parse_error,
        )

    cyclomatic_values = [
        value
        for result in results
        for value in result.cyclomatic_values
    ]
    cognitive_values = [
        value
        for result in results
        for value in result.cognitive_values
    ]
    jones_values = [
        value
        for result in results
        for value in result.jones_values
    ]

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
                kind = f"python_{field_type.lower()}"
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
                isinstance(decorator.func.value, ast.Name)
                and decorator.func.value.id == "api"
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
    """Load and analyze Python files for each module."""
    global_relational_fields: dict[str, dict[str, str]] = defaultdict(dict)

    for module_name in sorted(modules):
        module = modules[module_name]
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
            module.class_summaries.extend(class_summaries)

            for class_summary in class_summaries:
                for target_model in get_class_target_models(class_summary):
                    for field_name, comodel_name in class_summary.field_models.items():
                        global_relational_fields[target_model][field_name] = comodel_name

        for class_summary in module.class_summaries:
            module.declared_models.update(
                model_name
                for model_name in class_summary.declared_models
                if model_name not in class_summary.inherit_models
            )
            module.inherited_models.update(class_summary.inherit_models)

    return modules


def find_external_ids(text: str) -> list[str]:
    """Extract external identifiers from text."""
    return [match.group(1) for match in EXTERNAL_ID_RE.finditer(text)]


def resolve_related_model(path: str, field_models: dict[str, str]) -> str | None:
    """Resolve related/depends root field to comodel."""
    root_field = path.split(".", 1)[0]
    return field_models.get(root_field)


def add_model_links(
    edges: dict[tuple[str, str], CouplingEdge],
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
            CouplingEdge(source_module=source_module, target_module=target_module),
        )
        edge.add(kind=kind, file_path=file_path, line=line, detail=detail)


def add_module_links(
    edges: dict[tuple[str, str], CouplingEdge],
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
            CouplingEdge(source_module=source_module, target_module=target_module),
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
    edges: dict[tuple[str, str], CouplingEdge],
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
                    kind="python__inherit",
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
                    kind="python_related",
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
                    kind="python_api_depends",
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
                    kind="python_api_onchange",
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
                    kind="python_api_constrains",
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
                    kind="python_env_model",
                    file_path=class_summary.file_path,
                    line=line,
                    detail=f"self.env['{model_name}'] access",
                )

            for model_name, method_name, line in class_summary.method_calls:
                kind = (
                    "python_private_method_call"
                    if method_name.startswith("_")
                    else "python_method_call"
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
                    kind="python_field_property_access",
                    file_path=class_summary.file_path,
                    line=line,
                    detail=f"{model_name}.{field_name} access",
                )


def analyze_xml_file(
    file_path: Path,
    source_module: str,
    modules: dict[str, ModuleInfo],
    edges: dict[tuple[str, str], CouplingEdge],
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
            CouplingEdge(source_module=source_module, target_module=target_module),
        )
        line = text.count("\n", 0, match.start()) + 1
        edge.add(
            kind="xml_percent_ref",
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
                        CouplingEdge(
                            source_module=source_module,
                            target_module=target_module,
                        ),
                    )
                    edge.add(
                        kind="xml_inherit_id",
                        file_path=file_path,
                        line=line,
                        detail=f"inherit_id -> {xml_id}",
                    )

            if (
                current_record_model == "ir.rule"
                and field_name == "model_id"
                and "." in xml_id
            ):
                target_module = xml_id.split(".", 1)[0]
                if target_module != source_module and target_module in modules:
                    line = resolve_line_from_snippet(xml_id, line)
                    edge = edges.setdefault(
                        (source_module, target_module),
                        CouplingEdge(
                            source_module=source_module,
                            target_module=target_module,
                        ),
                    )
                    edge.add(
                        kind="security_ir_rule_model_ref",
                        file_path=file_path,
                        line=line,
                        detail=f"ir.rule model_id -> {xml_id}",
                    )

        ref_value = element.attrib.get("ref")
        if ref_value and "." in ref_value:
            target_module = ref_value.split(".", 1)[0]
            if target_module != source_module and target_module in modules:
                kind = "xml_ref"
                if current_record_model == "ir.rule":
                    kind = "security_ir_rule_ref"
                elif security_file:
                    kind = "security_xml_ref"
                edge = edges.setdefault(
                    (source_module, target_module),
                    CouplingEdge(source_module=source_module, target_module=target_module),
                )
                line = (getattr(element, "sourceline", 0) or 0)
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
    edges: dict[tuple[str, str], CouplingEdge],
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
                        CouplingEdge(
                            source_module=source_module,
                            target_module=target_module,
                        ),
                    )
                    edge.add(
                        kind="security_csv_ref",
                        file_path=file_path,
                        line=row_index,
                        detail=f"security csv ref -> {xml_id}",
                    )


def analyze_xml_links(
    modules: dict[str, ModuleInfo],
    edges: dict[tuple[str, str], CouplingEdge],
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
    edges: dict[tuple[str, str], CouplingEdge],
) -> None:
    """Add coupling edges from manifest depends entries."""
    for module in modules.values():
        for dependency in sorted(module.manifest_depends):
            if dependency == module.name or dependency not in modules:
                continue
            edge = edges.setdefault(
                (module.name, dependency),
                CouplingEdge(source_module=module.name, target_module=dependency),
            )
            edge.add(
                kind="manifest_depends",
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


def build_module_scores(
    modules: dict[str, ModuleInfo],
    edges: dict[tuple[str, str], CouplingEdge],
) -> dict[str, dict[str, int]]:
    """Build per-module score stats."""
    stats: dict[str, dict[str, int]] = {
        module_name: {"outgoing_score": 0, "incoming_score": 0}
        for module_name in modules
    }

    for edge in edges.values():
        edge_score_value = edge.score
        if edge_score_value <= 0:
            continue
        stats[edge.source_module]["outgoing_score"] += edge_score_value
        stats[edge.target_module]["incoming_score"] += edge_score_value

    return stats


