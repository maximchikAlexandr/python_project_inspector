"""Dashboard API coverage for SC-004 (stored-data views)."""

from pathlib import Path

from click.testing import CliRunner
from fastapi.testclient import TestClient

from python_project_inspector.cli.main import cli
from python_project_inspector.runtime.paths import lock_path, store_path
from python_project_inspector.server.app import create_app


def _client(mini_repo: Path, analysis_dir: Path) -> TestClient:
    runner = CliRunner()
    analyze = runner.invoke(
        cli,
        ["--repo", str(mini_repo), "--branch", "HEAD", "--analysis-dir", str(analysis_dir), "analyze"],
    )
    assert analyze.exit_code == 0, analyze.output
    return TestClient(create_app(store_path(analysis_dir), lock_path(analysis_dir)))


def test_dashboard_api_views_from_store(mini_repo: Path, tmp_path: Path):
    """All dashboard data endpoints return stored history for SC-004."""
    client = _client(mini_repo, tmp_path / "analysis")

    status = client.get("/api/status")
    assert status.status_code == 200
    assert status.json()["commit_count"] == 2

    commits = client.get("/api/commits")
    assert commits.status_code == 200
    assert len(commits.json()) == 2

    module_ts = client.get(
        "/api/metrics/timeseries",
        params={"level": "module", "metric": "cyclomatic", "name": "demo_module"},
    )
    assert module_ts.status_code == 200
    assert module_ts.json()["series"][0]["points"]

    file_ts = client.get(
        "/api/metrics/timeseries",
        params={"level": "file", "metric": "lines", "name": "demo_module/models.py"},
    )
    assert file_ts.status_code == 200
    assert file_ts.json()["series"][0]["points"]

    hotspots = client.get("/api/hotspots", params={"by": "growth", "level": "file"})
    assert hotspots.status_code == 200
    assert hotspots.json()["items"]

    edges = client.get("/api/edges")
    assert edges.status_code == 200
    assert "edges" in edges.json()

    structure = client.get("/api/structure/timeseries")
    assert structure.status_code == 200
    points = structure.json()["points"]
    assert len(points) == 2
    assert "edge_count" in points[0]

    unknown = client.get(
        "/api/metrics/timeseries",
        params={"level": "module", "metric": "cyclomatic", "name": "missing"},
    )
    assert unknown.status_code == 404
