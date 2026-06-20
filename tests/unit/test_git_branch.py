"""Tests for git branch resolution."""

import subprocess
from pathlib import Path

from ppi.history import git


def test_resolve_branch_head_returns_branch_name(mini_repo: Path):
    """HEAD resolves to the current branch name, not the literal ref."""
    expected = subprocess.check_output(
        ["git", "-C", str(mini_repo), "rev-parse", "--abbrev-ref", "HEAD"],
        text=True,
    ).strip()
    result = git.resolve_branch(mini_repo, "HEAD")
    assert result.is_ok()
    assert result.ok == expected
    assert result.ok != "HEAD"
