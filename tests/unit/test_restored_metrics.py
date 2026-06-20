"""Unit tests for restored pipeline metrics helpers."""

import shutil
from pathlib import Path

from toolz import pipe

from ppi.core.analyzer import report_config_to_scope
from ppi.core.contracts import (
    AnalysisBatch,
    CommitRef,
    CouplingEdge,
    EdgeBreakdown,
    Evidence,
    batch_from_json,
    batch_to_json,
)
from ppi.core.odoo.pipeline import (
    CouplingEdge as PipelineCouplingEdge,
)
from ppi.core.odoo.pipeline import (
    ModuleInfo,
    analyze_python_complexity_for_module,
    build_report_config,
    discover_analysis_artifacts,
    edge_breakdown,
    enrich_modules_with_code_analysis,
    file_top_folder,
    module_python_file_count,
    resolve_addons_paths,
    validate_addons_paths,
)


def test_edge_breakdown_total_invariant():
    """Breakdown categories sum to total."""
    edge = PipelineCouplingEdge(source_module="a", target_module="b")
    edge.add("python_many2one", Path("a/models.py"), 10, "field -> model")
    edge.add("xml_inherit_id", Path("a/views.xml"), 5, "inherit")
    breakdown = edge_breakdown(edge)
    assert breakdown.total == breakdown.model_reuse + breakdown.view
    assert edge.score == breakdown.total


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


def test_evidence_roundtrip_via_batch_json():
    """Evidence survives AnalysisBatch JSON encode/decode."""
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
                breakdown=EdgeBreakdown(
                    model_reuse=2,
                    extension_or_method=0,
                    view=0,
                    field_property=0,
                    total=2,
                ),
                evidence=(
                    Evidence(
                        kind="python_many2one",
                        file_path="a/models.py",
                        line=10,
                        detail="field -> model",
                    ),
                ),
            ),
        ),
        failures=(),
    )
    restored = batch_from_json(batch_to_json(batch))
    assert len(restored.edges) == 1
    assert restored.edges[0].evidence[0].kind == "python_many2one"
    assert restored.edges[0].evidence[0].line == 10


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
    artifacts = pipe(
        (repo,),
        resolve_addons_paths,
        validate_addons_paths,
        discover_analysis_artifacts(
            build_report_config(project_label="sample", all_modules=True),
        ),
        enrich_modules_with_code_analysis,
    )
    module = analyze_python_complexity_for_module(artifacts.modules["base_module"])
    relative_paths = {item.relative_path for item in module.python_complexity_files}
    assert "tests/test_partner.py" not in relative_paths
    assert "__manifest__.py" not in relative_paths
    assert "models/partner.py" in relative_paths
    assert module_python_file_count(module) == len(relative_paths)
