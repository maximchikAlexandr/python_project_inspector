"""Contract tests for HTTP API."""

import os
from pathlib import Path

from click.testing import CliRunner
from fastapi.testclient import TestClient

from ppi.cli.main import cli
from ppi.runtime import lock as project_lock
from ppi.runtime.paths import store_path, writer_lock_path
from ppi.server.app import create_app


def _analyze_fixture(mini_repo: Path, analysis_dir: Path) -> TestClient:
    runner = CliRunner()
    analyze = runner.invoke(
        cli,
        [
            "--repo",
            str(mini_repo),
            "--branch",
            "HEAD",
            "--analysis-dir",
            str(analysis_dir),
            "analyze",
        ],
    )
    assert analyze.exit_code == 0, analyze.output
    return TestClient(create_app(store_path(mini_repo), writer_lock_path(mini_repo)))


def test_http_status_without_store(tmp_path: Path):
    """Status endpoint works before any analysis run."""
    repo = tmp_path / "repo"
    repo.mkdir()
    analysis_dir = tmp_path / "analysis"
    analysis_dir.mkdir()
    client = TestClient(create_app(store_path(repo), writer_lock_path(repo)))
    status = client.get("/api/status")
    assert status.status_code == 200
    body = status.json()
    assert body["store_present"] is False
    assert body["schema_version"] == 2
    assert body["expected_schema_version"] == 2
    assert body["schema_compatible"] is True


def test_http_store_missing_returns_503(tmp_path: Path):
    """Data endpoints return 503 when the store file is absent."""
    repo = tmp_path / "repo"
    repo.mkdir()
    analysis_dir = tmp_path / "analysis"
    analysis_dir.mkdir()
    client = TestClient(create_app(store_path(repo), writer_lock_path(repo)))
    response = client.get("/api/commits")
    assert response.status_code == 503
    assert response.json()["detail"] == "store not found"


def test_http_locked_store_returns_409(mini_repo: Path, tmp_path: Path):
    """Data endpoints return 409 while a writer holds the lock."""
    analysis_dir = tmp_path / "analysis"
    client = _analyze_fixture(mini_repo, analysis_dir)
    lock_file = writer_lock_path(mini_repo)
    lock_file.write_text(str(os.getpid()), encoding="utf-8")
    try:
        assert project_lock.is_locked(lock_file)
        response = client.get("/api/hotspots")
        assert response.status_code == 409
        assert response.json()["detail"] == "analysis in progress"
    finally:
        lock_file.unlink(missing_ok=True)


def test_http_status_and_commits(mini_repo: Path, tmp_path: Path):
    """API exposes status and commit timeline endpoints."""
    client = _analyze_fixture(mini_repo, tmp_path / "analysis")
    status = client.get("/api/status")
    assert status.status_code == 200
    body = status.json()
    assert body["commit_count"] == 2
    assert body["store_present"] is True
    assert body["schema_version"] == 2
    assert body["expected_schema_version"] == 2
    assert body["schema_compatible"] is True
    assert body["project_id"]
    assert body["branch"]
    commits = client.get("/api/commits")
    assert commits.status_code == 200
    assert len(commits.json()) == 2


def test_http_timeseries_module_and_file(mini_repo: Path, tmp_path: Path):
    """Timeseries endpoints return module and file series."""
    client = _analyze_fixture(mini_repo, tmp_path / "analysis")
    module = client.get(
        "/api/metrics/timeseries",
        params={"level": "module", "metric": "cyclomatic", "name": "demo_module"},
    )
    assert module.status_code == 200
    module_body = module.json()
    assert module_body["level"] == "module"
    assert module_body["series"][0]["name"] == "demo_module"
    assert len(module_body["series"][0]["points"]) == 2

    file_series = client.get(
        "/api/metrics/timeseries",
        params={
            "level": "file",
            "metric": "lines",
            "name": "demo_module/models.py",
        },
    )
    assert file_series.status_code == 200
    file_body = file_series.json()
    assert file_body["level"] == "file"
    assert file_body["series"][0]["name"] == "demo_module/models.py"


def test_http_hotspots_and_edges(mini_repo: Path, tmp_path: Path):
    """Hotspots and coupling edges endpoints match contract shapes."""
    client = _analyze_fixture(mini_repo, tmp_path / "analysis")
    catalog = client.get("/api/catalog", params={"level": "module"})
    assert catalog.status_code == 200
    assert "demo_module" in catalog.json()["names"]
    hotspots = client.get(
        "/api/hotspots",
        params={"level": "module", "metric": "cyclomatic", "by": "growth", "limit": 5},
    )
    assert hotspots.status_code == 200
    hotspot_body = hotspots.json()
    assert hotspot_body["by"] == "growth"
    assert isinstance(hotspot_body["items"], list)
    assert hotspot_body["items"][0]["name"] == "demo_module"

    edges = client.get("/api/edges", params={"min_score": 0})
    assert edges.status_code == 200
    edge_body = edges.json()
    assert "commit_hash" in edge_body
    assert isinstance(edge_body["edges"], list)


def test_http_structure_timeseries(mini_repo: Path, tmp_path: Path):
    """Structure timeseries endpoint returns per-commit coupling summary."""
    client = _analyze_fixture(mini_repo, tmp_path / "analysis")
    response = client.get("/api/structure/timeseries")
    assert response.status_code == 200
    body = response.json()
    assert len(body["points"]) == 2
    assert body["points"][0]["edge_count"] >= 0


def test_http_edges_unknown_commit_returns_404(mini_repo: Path, tmp_path: Path):
    """Unknown commit hash on edges returns 404."""
    client = _analyze_fixture(mini_repo, tmp_path / "analysis")
    response = client.get("/api/edges", params={"commit": "deadbeef"})
    assert response.status_code == 404
    assert "unknown commit" in response.json()["detail"]


def test_http_unknown_module_returns_404(mini_repo: Path, tmp_path: Path):
    """Unknown module names return 404 per HTTP contract."""
    client = _analyze_fixture(mini_repo, tmp_path / "analysis")
    response = client.get(
        "/api/metrics/timeseries",
        params={"level": "module", "metric": "cyclomatic", "name": "nonexistent"},
    )
    assert response.status_code == 404
    assert "unknown module" in response.json()["detail"]
