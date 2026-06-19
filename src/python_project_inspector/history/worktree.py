"""Isolated git worktree lifecycle management."""

from __future__ import annotations

import shutil
from pathlib import Path

from expression.core.result import Error, Ok, Result

from python_project_inspector.history import git
from python_project_inspector.runtime.paths import worktree_path as default_worktree_path


def ensure_worktree(
    repo_path: Path,
    branch: str,
    analysis_dir: Path,
) -> Result[Path, str]:
    """Create or reuse a detached worktree at the branch tip."""
    target = default_worktree_path(analysis_dir)
    if target.exists():
        cleanup = remove_worktree(repo_path, analysis_dir)
        if cleanup.is_error():
            return cleanup
    target.parent.mkdir(parents=True, exist_ok=True)
    created = git.run_git(repo_path, "worktree", "add", "--detach", str(target), branch)
    if created.is_error():
        return created
    return Ok(target)


def checkout_commit(worktree: Path, commit_hash: str) -> Result[None, str]:
    """Check out one commit silently inside the worktree."""
    checked = git.run_git(worktree, "checkout", "--detach", "--quiet", "--force", commit_hash)
    if checked.is_error():
        return checked
    return Ok(None)


def remove_worktree(repo_path: Path, analysis_dir: Path) -> Result[None, str]:
    """Remove the project's worktree directory."""
    target = default_worktree_path(analysis_dir)
    if not target.exists():
        return Ok(None)
    removed = git.run_git(repo_path, "worktree", "remove", "--force", str(target))
    if removed.is_error():
        shutil.rmtree(target, ignore_errors=True)
        git.run_git(repo_path, "worktree", "prune")
    return Ok(None)
