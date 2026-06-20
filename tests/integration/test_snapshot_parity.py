"""Integration tests for CLI vs API snapshot parity."""

from __future__ import annotations

import json
from pathlib import Path

from click.testing import CliRunner
from fastapi.testclient import TestClient

from ppi.cli.main import cli
from ppi.runtime.paths import store_path, writer_lock_path
from ppi.server.app import create_app


def _normalize_json(value: object) -> object:
    """Normalize JSON-compatible structures for order-insensitive comparison."""
    if isinstance(value, dict):
        return {key: _normalize_json(item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        return [_normalize_json(item) for item in value]
    return value


def _analyze(repo: Path, analysis_dir: Path) -> TestClient:
    """Analyze a repository and return an API client."""
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


def test_cli_api_modules_parity(odoo_sample_repo: Path, tmp_path: Path):
    """CLI and API module snapshots return the same payload."""
    analysis_dir = tmp_path / "analysis"
    client = _analyze(odoo_sample_repo, analysis_dir)
    api_body = client.get("/api/snapshot/modules").json()

    runner = CliRunner()
    cli_result = runner.invoke(
        cli,
        [
            "--repo",
            str(odoo_sample_repo),
            "--analysis-dir",
            str(analysis_dir),
            "query",
            "--metric",
            "modules",
            "--format",
            "json",
        ],
    )
    assert cli_result.exit_code == 0, cli_result.output
    cli_body = json.loads(cli_result.output)
    assert _normalize_json(cli_body) == _normalize_json(api_body)


def test_cli_api_graph_parity(odoo_sample_repo: Path, tmp_path: Path):
    """CLI and API graph payloads match for the same commit."""
    analysis_dir = tmp_path / "analysis"
    client = _analyze(odoo_sample_repo, analysis_dir)
    api_body = client.get("/api/graph").json()

    runner = CliRunner()
    cli_result = runner.invoke(
        cli,
        [
            "--repo",
            str(odoo_sample_repo),
            "--analysis-dir",
            str(analysis_dir),
            "query",
            "--metric",
            "graph",
            "--format",
            "json",
        ],
    )
    assert cli_result.exit_code == 0, cli_result.output
    cli_body = json.loads(cli_result.output)
    assert _normalize_json(cli_body) == _normalize_json(api_body)


def test_unknown_commit_returns_404(odoo_sample_repo: Path, tmp_path: Path):
    """Unknown commit selectors return 404 on API and CLI."""
    analysis_dir = tmp_path / "analysis"
    client = _analyze(odoo_sample_repo, analysis_dir)
    response = client.get("/api/snapshot/modules", params={"commit": "deadbeef"})
    assert response.status_code == 404

    runner = CliRunner()
    cli_result = runner.invoke(
        cli,
        [
            "--repo",
            str(odoo_sample_repo),
            "--analysis-dir",
            str(analysis_dir),
            "query",
            "--metric",
            "modules",
            "--commit",
            "deadbeef",
        ],
    )
    assert cli_result.exit_code != 0
    assert "Unknown commit" in cli_result.output
