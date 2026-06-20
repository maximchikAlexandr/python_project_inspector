"""Integration tests for history walking."""

import subprocess
from pathlib import Path

from ppi.history import git
from ppi.history.walker import cleanup_worktree, walk_history


def test_history_walk_non_merge_commits(mini_repo: Path, tmp_path: Path):
    """Walk emits one batch per non-merge commit without touching working tree."""
    before_branch = subprocess.check_output(
        ["git", "-C", str(mini_repo), "rev-parse", "--abbrev-ref", "HEAD"],
        text=True,
    ).strip()
    before_status = subprocess.check_output(
        ["git", "-C", str(mini_repo), "status", "--porcelain"],
        text=True,
    )
    analysis_dir = tmp_path / "analysis"
    branch = git.resolve_branch(mini_repo, "HEAD").ok
    prepared = walk_history(mini_repo, branch, analysis_dir)
    assert prepared.is_ok()
    batches, state = prepared.ok
    collected = list(batches)
    cleanup_worktree(mini_repo, analysis_dir)
    assert state.commits_total == 2
    assert len(collected) == 2
    assert collected[0].commit.commit_order == 0
    assert collected[1].commit.commit_order == 1
    after_branch = subprocess.check_output(
        ["git", "-C", str(mini_repo), "rev-parse", "--abbrev-ref", "HEAD"],
        text=True,
    ).strip()
    after_status = subprocess.check_output(
        ["git", "-C", str(mini_repo), "status", "--porcelain"],
        text=True,
    )
    assert before_branch == after_branch
    assert before_status == after_status


def test_history_walk_keeps_global_commit_order_when_skipping(mini_repo: Path, tmp_path: Path):
    """Incremental walks keep commit_order from full branch history."""
    analysis_dir = tmp_path / "analysis"
    branch = git.resolve_branch(mini_repo, "HEAD").ok
    all_commits = git.list_non_merge_commits(mini_repo, branch).ok
    prepared = walk_history(
        mini_repo,
        branch,
        analysis_dir,
        skip_commits={all_commits[0]},
    )
    assert prepared.is_ok()
    batches, state = prepared.ok
    collected = list(batches)
    cleanup_worktree(mini_repo, analysis_dir)
    assert state.commits_total == 1
    assert collected[0].commit.commit_order == 1
