"""Contract tests for restored HTTP snapshot and parity endpoints."""

from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner
from fastapi.testclient import TestClient

from ppi.cli.main import cli
from ppi.runtime.paths import store_path, writer_lock_path
from ppi.server.app import create_app


def _analyze_odoo_sample(repo: Path, analysis_dir: Path) -> TestClient:
    """Analyze odoo_sample and return an API client."""
    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "--repo",
            str(repo),
            "--branch",
            "HEAD",
            "--analysis-dir",
            str(analysis_dir),
            "analyze",
        ],
    )
    assert result.exit_code == 0, result.output
    return TestClient(create_app(store_path(repo), writer_lock_path(repo)))


def test_http_project_info(odoo_sample_repo: Path, tmp_path: Path):
    """project/info endpoint returns project metadata."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get("/api/project/info")
    assert response.status_code == 200
    body = response.json()
    assert body["store_present"] is True
    assert body["commit_count"] >= 1
    assert body["schema_version"] == 3
    assert body["project_id"]
    assert body["branch"]


def test_http_ui_config(odoo_sample_repo: Path, tmp_path: Path):
    """ui/config endpoint returns UI configuration."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get("/api/ui/config")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["dashboard_metrics"], list)
    assert isinstance(body["aggregations"], list)
    assert isinstance(body["tables"], list)
    assert "graph" in body


def test_http_snapshot_table_modules(odoo_sample_repo: Path, tmp_path: Path):
    """snapshot/table/modules returns generic table rows."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get("/api/snapshot/table/modules")
    assert response.status_code == 200
    body = response.json()
    assert body["commit_hash"]
    assert isinstance(body["rows"], list)
    assert body["rows"]
    assert "module_name" in body["rows"][0]["cells"]
    assert "metrics" in body["rows"][0]["cells"]


def test_http_snapshot_table_files(odoo_sample_repo: Path, tmp_path: Path):
    """snapshot/table/files returns generic table rows."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get("/api/snapshot/table/files")
    assert response.status_code == 200
    body = response.json()
    assert body["commit_hash"]
    assert isinstance(body["rows"], list)
    assert body["rows"]


def test_http_snapshot_table_files_filtered_by_module(odoo_sample_repo: Path, tmp_path: Path):
    """snapshot/table/files filters by module."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get("/api/snapshot/table/files", params={"module": "base_module"})
    assert response.status_code == 200
    body = response.json()
    assert body["rows"]
    for row in body["rows"]:
        assert row["cells"]["module_name"] == "base_module"


def test_http_snapshot_relations(odoo_sample_repo: Path, tmp_path: Path):
    """snapshot/relations returns relation rows expanded from edges."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get("/api/snapshot/relations")
    assert response.status_code == 200
    body = response.json()
    assert body["commit_hash"]
    assert isinstance(body["relations"], list)


def test_http_graph_generic_contract(odoo_sample_repo: Path, tmp_path: Path):
    """graph endpoint returns generic node/edge contract."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get("/api/graph")
    assert response.status_code == 200
    body = response.json()
    assert body["commit_hash"]
    assert isinstance(body["nodes"], list)
    assert isinstance(body["edges"], list)
    if body["edges"]:
        edge = body["edges"][0]
        assert "source" in edge
        assert "target" in edge
        assert "score" in edge
        assert isinstance(edge["kinds"], dict)