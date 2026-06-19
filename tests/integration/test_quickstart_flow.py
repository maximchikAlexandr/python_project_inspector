"""Quickstart-style validation on the fixture repository."""

import time
from pathlib import Path

from click.testing import CliRunner

from python_project_inspector.cli.main import cli


def test_quickstart_analyze_query_serve_flow(mini_repo: Path, tmp_path: Path):
    """Mirror quickstart scenarios 1-4 on the mini fixture repo."""
    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
    doctor = runner.invoke(
        cli,
        ["--repo", str(mini_repo), "--branch", "HEAD", "--analysis-dir", str(analysis_dir), "doctor"],
    )
    assert doctor.exit_code == 0, doctor.output
    assert "OK" in doctor.output

    analyze = runner.invoke(
        cli,
        ["--repo", str(mini_repo), "--branch", "HEAD", "--analysis-dir", str(analysis_dir), "analyze"],
    )
    assert analyze.exit_code == 0, analyze.output
    assert "succeeded" in analyze.output.lower()

    started = time.perf_counter()
    query = runner.invoke(
        cli,
        [
            "--repo",
            str(mini_repo),
            "--branch",
            "HEAD",
            "--analysis-dir",
            str(analysis_dir),
            "query",
            "--metric",
            "complexity",
            "--module",
            "demo_module",
            "--format",
            "json",
        ],
    )
    elapsed = time.perf_counter() - started
    assert query.exit_code == 0, query.output
    assert elapsed < 5.0
    assert "commit_order" in query.output

    rerun = runner.invoke(
        cli,
        ["--repo", str(mini_repo), "--branch", "HEAD", "--analysis-dir", str(analysis_dir), "analyze"],
    )
    assert rerun.exit_code == 0, rerun.output

    from fastapi.testclient import TestClient

    from python_project_inspector.runtime.paths import lock_path, store_path
    from python_project_inspector.server.app import create_app, _static_dir

    client = TestClient(create_app(store_path(analysis_dir), lock_path(analysis_dir)))
    assert client.get("/api/status").status_code == 200
    assert client.get("/api/catalog?level=module").status_code == 200
    assert client.get("/api/hotspots").status_code == 200
    static = _static_dir()
    assert static is not None
    assert (static / "index.html").is_file()
