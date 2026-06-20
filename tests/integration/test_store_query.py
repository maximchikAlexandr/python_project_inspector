"""Integration tests for store persistence and queries."""

from pathlib import Path

from click.testing import CliRunner

from ppi.cli.main import cli


def test_analyze_persist_and_query(mini_repo: Path, tmp_path: Path):
    """Analyze persists history and query returns chronological rows."""
    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
    result = runner.invoke(
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
    assert result.exit_code == 0, result.output
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
    assert query.exit_code == 0, query.output
    assert "commit_order" in query.output
    rerun = runner.invoke(
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
    assert rerun.exit_code == 0, rerun.output
    assert "succeeded: 0" in rerun.output or "Analyzed 0 commits" in rerun.output
