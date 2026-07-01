"""Contract tests for snapshot reads on CLI and HTTP API."""

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


def test_cli_snapshot_table_modules(odoo_sample_repo: Path, tmp_path: Path):
    """CLI snapshot-table-modules metric returns module rows."""
    _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "--repo",
            str(odoo_sample_repo),
            "--analysis-dir",
            str(tmp_path / "analysis"),
            "query",
            "--metric",
            "snapshot-table-modules",
            "--format",
            "json",
        ],
    )
    assert result.exit_code == 0, result.output
    assert "base_module" in result.output


def test_http_snapshot_table_modules_and_graph(odoo_sample_repo: Path, tmp_path: Path):
    """HTTP snapshot/table/modules and graph endpoints return stored data."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    modules = client.get("/api/snapshot/table/modules")
    assert modules.status_code == 200
    body = modules.json()
    assert body["rows"]
    assert "module_name" in body["rows"][0]["cells"]
    graph = client.get("/api/graph")
    assert graph.status_code == 200
    graph_body = graph.json()
    assert graph_body["nodes"]
    assert isinstance(graph_body["edges"], list)
    for edge in graph_body["edges"]:
        assert "kinds" in edge
        assert isinstance(edge["kinds"], dict)


def test_unknown_module_returns_404(odoo_sample_repo: Path, tmp_path: Path):
    """Unknown module returns 404 on HTTP snapshot/table/files filter."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get("/api/snapshot/table/files", params={"module": "missing_module"})
    assert response.status_code == 404