"""Contract tests for CLI surface."""

import os
from pathlib import Path

from click.testing import CliRunner

from ppi.cli.main import cli
from ppi.runtime.paths import analysis_dir_for_repo, ensure_analysis_dir, writer_lock_path


def test_cli_help_lists_commands(tmp_path: Path):
    """CLI exposes analyze, query, serve, and doctor."""
    runner = CliRunner()
    repo = tmp_path / "repo"
    repo.mkdir()
    result = runner.invoke(cli, ["--repo", str(repo), "--help"])
    assert result.exit_code == 0
    for command in ("analyze", "query", "serve", "doctor"):
        assert command in result.output
    assert "--verbose" in result.output or "-v" in result.output


def test_query_supports_file_and_csv(mini_repo: Path, tmp_path: Path):
    """Query accepts --file and --format csv per CLI contract."""
    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
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
            "lines",
            "--file",
            "demo_module/models.py",
            "--format",
            "csv",
        ],
    )
    assert query.exit_code == 0, query.output
    assert "commit_order" in query.output
    assert "commit_hash" in query.output


def test_analyze_refuses_second_writer(mini_repo: Path, tmp_path: Path):
    """Concurrent analyze attempts fail when the store lock is held."""
    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
    lock_file = writer_lock_path(mini_repo)
    ensure_analysis_dir(analysis_dir)
    ensure_analysis_dir(lock_file.parent)
    lock_file.write_text(str(os.getpid()), encoding="utf-8")
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
    lock_file.unlink(missing_ok=True)
    assert result.exit_code != 0
    assert "locked" in result.output.lower()


def test_doctor_reports_schema_version(mini_repo: Path, tmp_path: Path):
    """Doctor surfaces store schema version when a store exists."""
    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
    runner.invoke(
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
    doctor = runner.invoke(
        cli,
        ["--repo", str(mini_repo), "--branch", "HEAD", "--analysis-dir", str(analysis_dir), "doctor"],
    )
    assert doctor.exit_code == 0, doctor.output
    assert "schema_version=2" in doctor.output
    assert "expected=2" in doctor.output
