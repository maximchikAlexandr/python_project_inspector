"""Git plumbing for history traversal."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from expression.core.result import Error, Ok, Result


@dataclass(frozen=True, slots=True)
class GitCommitInfo:
    """Commit metadata read from git."""

    commit_hash: str
    author_name: str
    author_email: str
    authored_at: int
    committed_at: int
    summary: str


def run_git(repo_path: Path, *args: str) -> Result[str, str]:
    """Run a git command with captured output."""
    try:
        completed = subprocess.run(
            ["git", "-C", str(repo_path), *args],
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return Error("git executable not found on PATH")
    if completed.returncode != 0:
        message = (completed.stderr or completed.stdout or "git command failed").strip()
        return Error(message)
    return Ok(completed.stdout)


def resolve_branch(repo_path: Path, branch: str | None) -> Result[str, str]:
    """Resolve branch name, defaulting to the current branch."""
    if branch is None:
        current = run_git(repo_path, "rev-parse", "--abbrev-ref", "HEAD")
        if current.is_error():
            return current
        name = current.ok.strip()
        if name == "HEAD":
            return Error("Repository is in detached HEAD state; pass --branch explicitly")
        return Ok(name)
    verify = run_git(repo_path, "rev-parse", "--verify", branch)
    if verify.is_error():
        return Error(f"Branch not found: {branch}")
    if branch == "HEAD":
        current = run_git(repo_path, "rev-parse", "--abbrev-ref", "HEAD")
        if current.is_error():
            return current
        name = current.ok.strip()
        if name == "HEAD":
            return Error("Repository is in detached HEAD state; pass --branch explicitly")
        return Ok(name)
    return Ok(branch)


def list_non_merge_commits(repo_path: Path, branch: str) -> Result[list[str], str]:
    """List non-merge commits oldest to newest for one branch."""
    output = run_git(
        repo_path,
        "rev-list",
        "--no-merges",
        "--reverse",
        branch,
    )
    if output.is_error():
        return output
    commits = [line.strip() for line in output.ok.splitlines() if line.strip()]
    return Ok(commits)


def read_commit_info(repo_path: Path, commit_hash: str) -> Result[GitCommitInfo, str]:
    """Read metadata for one commit hash."""
    output = run_git(
        repo_path,
        "show",
        "-s",
        "--format=%H%x1f%an%x1f%ae%x1f%at%x1f%ct%x1f%s",
        commit_hash,
    )
    if output.is_error():
        return output
    parts = output.ok.strip().split("\x1f")
    if len(parts) != 6:
        return Error(f"Unexpected git show output for {commit_hash}")
    return Ok(
        GitCommitInfo(
            commit_hash=parts[0],
            author_name=parts[1],
            author_email=parts[2],
            authored_at=int(parts[3]),
            committed_at=int(parts[4]),
            summary=parts[5],
        ),
    )


def to_commit_ref(info: GitCommitInfo, commit_order: int):
    """Convert git metadata to a CommitRef contract."""
    from python_project_inspector.core.contracts import CommitRef

    return CommitRef(
        commit_hash=info.commit_hash,
        commit_order=commit_order,
        author_name=info.author_name,
        author_email=info.author_email,
        authored_at=info.authored_at,
        committed_at=info.committed_at,
        summary=info.summary,
    )


def git_version(repo_path: Path) -> Result[str, str]:
    """Return git version output."""
    return run_git(repo_path, "--version")


def utc_now_epoch() -> int:
    """Return current UTC time as epoch seconds."""
    return int(datetime.now(timezone.utc).timestamp())
