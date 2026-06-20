"""Edge-case integration tests from the feature spec."""

import os
import subprocess
from pathlib import Path
from unittest.mock import patch

from click.testing import CliRunner
from expression.core.result import Error

from ppi.cli.main import cli
from ppi.history import git
from ppi.runtime.paths import ensure_analysis_dir, writer_lock_path


def test_single_commit_repo_analyzes(tmp_path: Path):
    """Empty or single-commit repositories complete without error."""
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "t@e.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "T"], check=True)
    (repo / "readme.md").write_text("hello\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-m", "only"], check=True, capture_output=True)
    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["--repo", str(repo), "--branch", "HEAD", "--analysis-dir", str(tmp_path / "analysis"), "analyze"],
    )
    assert result.exit_code == 0, result.output
    assert "Analyzed 1/1 commits" in result.output


def test_invalid_branch_fails_fast(tmp_path: Path):
    """Unknown branch refs fail before analysis starts."""
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "--repo",
            str(repo),
            "--branch",
            "does-not-exist",
            "--analysis-dir",
            str(tmp_path / "analysis"),
            "analyze",
        ],
    )
    assert result.exit_code != 0


def test_analyze_continues_after_commit_failure(mini_repo: Path, tmp_path: Path):
    """SC-006: one commit failure is recorded and the run still completes."""
    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
    commits = git.list_non_merge_commits(mini_repo, git.resolve_branch(mini_repo, "HEAD").ok).ok
    failing_hash = commits[-1]
    original_read = git.read_commit_info

    def _fail_last(repo_path: Path, commit_hash: str):
        if commit_hash == failing_hash:
            return Error("simulated commit metadata failure")
        return original_read(repo_path, commit_hash)

    with patch("ppi.history.walker.git.read_commit_info", side_effect=_fail_last):
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
    assert "failed: 1" in result.output


def test_doctor_recovers_stale_worktree(mini_repo: Path, tmp_path: Path):
    """Doctor --recover-stale removes leftover worktree directories."""
    analysis_dir = tmp_path / "analysis"
    wt = analysis_dir / "worktree"
    analysis_dir.mkdir(parents=True)
    wt.mkdir()
    runner = CliRunner()
    before = runner.invoke(
        cli,
        ["--repo", str(mini_repo), "--branch", "HEAD", "--analysis-dir", str(analysis_dir), "doctor"],
    )
    assert before.exit_code != 0
    recovered = runner.invoke(
        cli,
        [
            "--repo",
            str(mini_repo),
            "--branch",
            "HEAD",
            "--analysis-dir",
            str(analysis_dir),
            "doctor",
            "--recover-stale",
        ],
    )
    assert recovered.exit_code == 0, recovered.output
    assert not wt.exists()
    assert "removed stale worktree" in recovered.output


def test_doctor_recover_stale_skips_worktree_when_locked(mini_repo: Path, tmp_path: Path):
    """Doctor --recover-stale does not remove worktree while analyze holds the lock."""

    analysis_dir = tmp_path / "analysis"
    wt = analysis_dir / "worktree"
    analysis_dir.mkdir(parents=True)
    wt.mkdir()
    lock_file = writer_lock_path(mini_repo)
    ensure_analysis_dir(lock_file.parent)
    lock_file.write_text(str(os.getpid()), encoding="utf-8")
    runner = CliRunner()
    try:
        result = runner.invoke(
            cli,
            [
                "--repo",
                str(mini_repo),
                "--branch",
                "HEAD",
                "--analysis-dir",
                str(analysis_dir),
                "doctor",
                "--recover-stale",
            ],
        )
        assert wt.exists()
        assert "removed stale worktree" not in result.output
    finally:
        lock_file.unlink(missing_ok=True)


def test_query_unknown_module_errors(mini_repo: Path, tmp_path: Path):
    """Query reports unknown module names clearly."""
    runner = CliRunner()
    analysis_dir = tmp_path / "analysis"
    runner.invoke(
        cli,
        ["--repo", str(mini_repo), "--branch", "HEAD", "--analysis-dir", str(analysis_dir), "analyze"],
    )
    result = runner.invoke(
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
            "missing_module",
        ],
    )
    assert result.exit_code != 0
    assert "Unknown module" in result.output
