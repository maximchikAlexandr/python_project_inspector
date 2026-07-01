"""Unit tests for restored pipeline metrics helpers."""

import shutil
from pathlib import Path

from toolz import pipe

from ppi.core.analyzer import report_config_to_scope
from ppi.core.contracts import (
    AnalysisBatch,
    CommitRef,
    CouplingEdge,
    batch_from_json,
    batch_to_json,
)
from ppi.core.odoo.facts import breakdown_from_kind_counts
from ppi.core.odoo.pipeline import (
    CouplingEdgeAccumulator as PipelineCouplingEdge,
)
from ppi.core.odoo.pipeline import (
    ModuleInfo,
    analyze_python_complexity_for_module,
    build_report_config,
    discover_analysis_artifacts,
    enrich_modules_with_code_analysis,
    file_top_folder,
    module_python_file_count,
    resolve_addons_paths,
    validate_addons_paths,
)


def test_edge_breakdown_total_invariant():
    """Breakdown totals equal the edge score."""
    from ppi.core.odoo.facts import EdgeKindCount
    from ppi.core.value_objects import EdgeKind

    edge = PipelineCouplingEdge(source_module="a", target_module="b")
    edge.add("python_many2one", Path("a/models.py"), 10, "field -> model")
    edge.add("xml_inherit_id", Path("a/views.xml"), 5, "inherit")
    counts = tuple(
        EdgeKindCount(kind=EdgeKind(k), count=c)
        for k, c in edge.kind_counter.items()
    )
    bd = breakdown_from_kind_counts(counts)
    assert sum(bd.values()) == edge.score


def test_file_top_folder_module_root():
    """Module-root files use sentinel top folder."""
    assert file_top_folder("models.py") == "."
    assert file_top_folder("models/partner.py") == "models"


def test_module_python_file_count():
    """Python file count follows complexity file list length."""
    module = ModuleInfo(
        name="demo",
        path=Path("demo"),
        manifest_path=Path("demo/__manifest__.py"),
    )
    assert module_python_file_count(module) == 0


def test_breakdown_roundtrip_via_batch_json():
    """Breakdown dict survives AnalysisBatch JSON encode/decode."""
    batch = AnalysisBatch(
        commit=CommitRef(
            commit_hash="abc",
            commit_order=0,
            author_name="Test",
            author_email="test@example.com",
            authored_at=1,
            committed_at=1,
            summary="init",
        ),
        files=(),
        modules=(),
        edges=(
            CouplingEdge(
                source_module="a",
                target_module="b",
                score=2,
                kinds={"python_many2one": 2},
                breakdown={"model_reuse": 2, "view": 0, "extension_or_method": 0, "field_property": 0},
            ),
        ),
        failures=(),
    )
    restored = batch_from_json(batch_to_json(batch))
    assert len(restored.edges) == 1
    assert restored.edges[0].breakdown == {"model_reuse": 2, "view": 0, "extension_or_method": 0, "field_property": 0}
    assert restored.edges[0].score == 2


def test_report_config_to_scope_normalization():
    """Report config maps to a persisted analysis scope."""
    config = build_report_config(
        project_label="demo",
        module_prefixes=("sale", "sale"),
        include_modules=("crm", "crm"),
        all_modules=False,
    )
    scope = report_config_to_scope(config)
    assert scope.project_label == "demo"
    assert scope.module_prefixes == ("sale",)
    assert scope.include_modules == ("crm",)
    assert scope.all_modules is False


def test_python_file_count_excludes_tests(odoo_sample_repo: Path, tmp_path: Path):
    """Production python file count excludes tests and manifest."""
    repo = tmp_path / "sample"
    shutil.copytree(odoo_sample_repo, repo)
    config = build_report_config(project_label="sample", all_modules=True)
    resolved = resolve_addons_paths((repo,))
    validated = validate_addons_paths(resolved)
    assert validated.is_ok(), validated.error  # type: ignore[union-attr]
    discovered = discover_analysis_artifacts(config, validated.default_value(None))  # type: ignore[union-attr]
    assert discovered.is_ok(), discovered.error  # type: ignore[union-attr]
    artifacts = pipe(
        discovered.default_value(None),  # type: ignore[union-attr,arg-type]
        enrich_modules_with_code_analysis,
    )
    module = analyze_python_complexity_for_module(artifacts.modules["base_module"])
    relative_paths = {item.relative_path for item in module.python_complexity_files}
    assert "tests/test_partner.py" not in relative_paths
    assert "__manifest__.py" not in relative_paths
    assert "models/partner.py" in relative_paths
    assert module_python_file_count(module) == len(relative_paths)
