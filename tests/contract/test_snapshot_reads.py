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


def test_cli_snapshot_modules(odoo_sample_repo: Path, tmp_path: Path):
    """CLI modules metric returns module snapshot rows."""
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
            "modules",
            "--format",
            "json",
        ],
    )
    assert result.exit_code == 0, result.output
    assert "base_module" in result.output
    assert "python_file_count" in result.output


def test_http_snapshot_and_graph(odoo_sample_repo: Path, tmp_path: Path):
    """HTTP snapshot and graph endpoints return stored data."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    modules = client.get("/api/snapshot/modules")
    assert modules.status_code == 200
    body = modules.json()
    assert body["modules"]
    graph = client.get("/api/graph")
    assert graph.status_code == 200
    graph_body = graph.json()
    assert graph_body["nodes"]
    assert isinstance(graph_body["edges"], list)


def test_unknown_module_returns_404(odoo_sample_repo: Path, tmp_path: Path):
    """Unknown module returns 404 on HTTP and ClickException on CLI."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get("/api/snapshot/module/missing_module")
    assert response.status_code == 404
    runner = CliRunner()
    cli_result = runner.invoke(
        cli,
        [
            "--repo",
            str(odoo_sample_repo),
            "--analysis-dir",
            str(tmp_path / "analysis"),
            "query",
            "--metric",
            "module-detail",
            "--module",
            "missing_module",
        ],
    )
    assert cli_result.exit_code != 0
    assert "Unknown module" in cli_result.output
