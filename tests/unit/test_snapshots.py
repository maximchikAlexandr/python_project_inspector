"""Unit tests for immutable snapshots: ModuleScope, discovery stages, freeze()."""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field as dc_field
from pathlib import Path

import pytest

from ppi.core.odoo.snapshots import (
    AllModules,
    ClassFacts,
    DuplicateModuleWarning,
    FailOnDuplicate,
    FileLineInfo,
    IncludeScope,
    KeepFirst,
    LineCategoryCount,
    LineCategoryCounts,
    ModuleCandidate,
    ModuleFacts,
    PreferPath,
    PrefixAndIncludeScope,
    PrefixScope,
    freeze_class_summary,
    freeze_module_info,
    module_scope_of,
    resolve_duplicate_modules,
    select_module_candidates,
)
from ppi.core.value_objects import LineCategory

# --- ModuleScope -----------------------------------------------------------


def test_module_scope_all_modules():
    s = module_scope_of(all_modules=True)
    assert isinstance(s, AllModules)
    assert s.includes("anything")


def test_module_scope_prefix():
    s = module_scope_of(all_modules=False, module_prefixes=("sale",))
    assert isinstance(s, PrefixScope)
    assert s.includes("sale_management")
    assert not s.includes("base")


def test_module_scope_include():
    s = module_scope_of(all_modules=False, include_modules=("base",))
    assert isinstance(s, IncludeScope)
    assert s.includes("base")
    assert not s.includes("sale")


def test_module_scope_prefix_and_include():
    s = module_scope_of(
        all_modules=False, module_prefixes=("sale",), include_modules=("base",)
    )
    assert isinstance(s, PrefixAndIncludeScope)
    assert s.includes("sale_x")
    assert s.includes("base")
    assert not s.includes("stock")


def test_module_scope_empty_falls_back_to_all():
    s = module_scope_of(all_modules=False)
    assert isinstance(s, AllModules)
    assert s.includes("anything")


def test_module_scope_normalizes_sorted_unique():
    s = module_scope_of(all_modules=False, module_prefixes=("b", "a", "b"))
    assert isinstance(s, PrefixScope)
    assert s.prefixes == ("a", "b")


# --- Discovery stages ------------------------------------------------------


def _manifests():
    return (
        Path("/addons/sale/__manifest__.py"),
        Path("/addons/base/__manifest__.py"),
        Path("/addons/sale/__manifest__.py"),
    )


def test_select_module_candidates_all():
    cands = select_module_candidates(_manifests(), AllModules())
    assert len(cands) == 3
    assert all(isinstance(c, ModuleCandidate) for c in cands)


def test_select_module_candidates_filtered():
    cands = select_module_candidates(_manifests(), PrefixScope(prefixes=("sale",)))
    assert len(cands) == 2
    assert all(c.module_name == "sale" for c in cands)


def test_resolve_duplicate_keep_first():
    cands = select_module_candidates(_manifests(), AllModules())
    kept, warns = resolve_duplicate_modules(cands, KeepFirst())
    assert len(kept) == 2
    assert len(warns) == 1
    assert warns[0].module_name == "sale"
    assert isinstance(warns[0], DuplicateModuleWarning)


def test_resolve_duplicate_prefer_path():
    cands = select_module_candidates(_manifests(), AllModules())
    kept, warns = resolve_duplicate_modules(cands, PreferPath(preferred_prefix="/addons/sale"))
    assert len(kept) == 2
    assert len(warns) == 1


def test_resolve_duplicate_fail():
    cands = select_module_candidates(_manifests(), AllModules())
    with pytest.raises(ValueError):
        resolve_duplicate_modules(cands, FailOnDuplicate())


def test_resolve_duplicate_no_duplicates_no_warnings():
    cands = (
        ModuleCandidate(
            module_name="a", module_path=Path("/a"), manifest_path=Path("/a/__manifest__.py")
        ),
        ModuleCandidate(
            module_name="b", module_path=Path("/b"), manifest_path=Path("/b/__manifest__.py")
        ),
    )
    kept, warns = resolve_duplicate_modules(cands, KeepFirst())
    assert len(kept) == 2
    assert warns == ()


# --- freeze() --------------------------------------------------------------


@dataclass
class _FakeClass:
    class_name: str = "C"
    file_path: Path = Path("/x.py")
    model_names: set = dc_field(default_factory=lambda: {"m"})
    declared_models: set = dc_field(default_factory=lambda: {"m"})
    inherit_models: set = dc_field(default_factory=set)
    inherit_links: list = dc_field(default_factory=list)
    declared_methods: set = dc_field(default_factory=lambda: {"run"})
    declared_field_models: dict = dc_field(default_factory=dict)
    field_models: dict = dc_field(default_factory=dict)
    field_links: list = dc_field(default_factory=list)
    related_paths: list = dc_field(default_factory=list)
    depends_paths: list = dc_field(default_factory=list)
    onchange_paths: list = dc_field(default_factory=list)
    constrains_paths: list = dc_field(default_factory=list)
    env_accesses: list = dc_field(default_factory=list)
    method_calls: list = dc_field(default_factory=list)
    field_property_accesses: list = dc_field(default_factory=list)


def test_freeze_class_summary_immutable():
    cf = freeze_class_summary(_FakeClass())
    assert isinstance(cf, ClassFacts)
    assert cf.class_name == "C"
    assert cf.model_names == frozenset({"m"})
    assert cf.declared_methods == frozenset({"run"})
    assert isinstance(cf.inherit_links, tuple)
    with pytest.raises((AttributeError, Exception)):
        cf.class_name = "X"  # type: ignore[misc]


@dataclass
class _FakeModule:
    name: str = "sale"
    path: Path = Path("/sale")
    manifest_path: Path = Path("/sale/__manifest__.py")
    manifest_depends: set = dc_field(default_factory=lambda: {"base"})
    declared_models: set = dc_field(default_factory=set)
    inherited_models: set = dc_field(default_factory=set)
    class_summaries: list = dc_field(default_factory=list)
    python_lines: int = 10
    js_lines: int = 0
    python_test_lines: int = 0
    xml_lines: int = 0
    css_lines: int = 0
    html_lines: int = 0
    total_lines: int = 10
    files: list = dc_field(default_factory=list)
    complexity: object = None
    python_complexity_files: list = dc_field(default_factory=list)
    python_complexity_parse_errors: int = 0


def test_freeze_module_info_immutable():
    from ppi.core.odoo.complexity import ComplexityMetrics

    fake = _FakeModule()
    fake.complexity = ComplexityMetrics.empty()
    mf = freeze_module_info(fake)
    assert isinstance(mf, ModuleFacts)
    assert mf.name == "sale"
    assert mf.manifest_depends == frozenset({"base"})
    assert isinstance(mf.class_facts, tuple)
    assert mf.line_categories()["python_lines"] == 10
    with pytest.raises((AttributeError, Exception)):
        mf.name = "x"  # type: ignore[misc]


def test_file_line_info_rejects_negative_lines():
    with pytest.raises(ValueError):
        FileLineInfo(relative_path="x.py", lines=-1, category="python_lines")


# --- LineCategoryCounts ----------------------------------------------------


def test_line_category_counts_from_mapping():
    counts = LineCategoryCounts.from_mapping({"python_lines": 10, "xml_lines": 5})
    assert counts.count_of(LineCategory.PYTHON) == 10
    assert counts.count_of(LineCategory.XML) == 5
    assert counts.count_of(LineCategory.JS) == 0
    assert counts.total() == 15


def test_line_category_counts_as_mapping():
    counts = LineCategoryCounts.from_mapping({"python_lines": 7})
    assert counts.as_mapping()["python_lines"] == 7
    assert counts.as_mapping()["js_lines"] == 0


def test_line_category_counts_empty():
    counts = LineCategoryCounts.empty()
    assert counts.total() == 0
    assert len(counts.counts) == len(list(LineCategory))


def test_line_category_count_rejects_negative():
    with pytest.raises(ValueError):
        LineCategoryCount(LineCategory.PYTHON, -1)


def test_line_category_counts_immutable():
    counts = LineCategoryCounts.from_mapping({"python_lines": 1})
    with pytest.raises((AttributeError, Exception)):
        counts.counts = ()  # type: ignore[misc]