"""Dashboard API coverage for SC-004 (stored-data views)."""

from pathlib import Path

from click.testing import CliRunner
from fastapi.testclient import TestClient

from ppi.cli.main import cli
from ppi.runtime.paths import store_path, writer_lock_path
from ppi.server.app import create_app


def _client(mini_repo: Path, analysis_dir: Path) -> TestClient:
    runner = CliRunner()
    analyze = runner.invoke(
        cli,
        ["--repo", str(mini_repo), "--branch", "HEAD", "--analysis-dir", str(analysis_dir), "analyze"],
    )
    assert analyze.exit_code == 0, analyze.output
    return TestClient(create_app(store_path(mini_repo), writer_lock_path(mini_repo)))


def test_dashboard_api_views_from_store(mini_repo: Path, tmp_path: Path):
    """All dashboard data endpoints return stored history for SC-004."""
    client = _client(mini_repo, tmp_path / "analysis")

    info = client.get("/api/project/info")
    assert info.status_code == 200
    assert info.json()["commit_count"] == 2

    commits = client.get("/api/commits")
    assert commits.status_code == 200
    assert len(commits.json()) == 2

    module_ts = client.get(
        "/api/metrics/timeseries",
        params={"level": "module", "metric_id": "cyclomatic", "name": "demo_module"},
    )
    assert module_ts.status_code == 200
    assert module_ts.json()["series"][0]["points"]

    file_ts = client.get(
        "/api/metrics/timeseries",
        params={"level": "file", "metric_id": "lines", "name": "demo_module/models.py"},
    )
    assert file_ts.status_code == 200
    assert file_ts.json()["series"][0]["points"]

    hotspots = client.get("/api/hotspots", params={"by": "growth", "level": "file", "metric_id": "cyclomatic"})
    assert hotspots.status_code == 200
    assert hotspots.json()["items"]

    graph = client.get("/api/graph")
    assert graph.status_code == 200
    assert "nodes" in graph.json()

    unknown = client.get(
        "/api/metrics/timeseries",
        params={"level": "module", "metric_id": "cyclomatic", "name": "missing"},
    )
    assert unknown.status_code == 404