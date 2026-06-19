"""Resolve per-project analysis paths outside the analyzed repository."""

from __future__ import annotations

import hashlib
from pathlib import Path


def project_id_from_repo(repo_path: Path) -> str:
    """Derive a stable project identifier from the canonical repo path."""
    canonical = str(repo_path.resolve())
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def default_analysis_root() -> Path:
    """Return the default user-level analysis root directory."""
    return Path.home() / ".local" / "share" / "python-project-inspector"


def analysis_dir_for_repo(repo_path: Path, analysis_root: Path | None = None) -> Path:
    """Return the analysis directory for one repository."""
    root = analysis_root or default_analysis_root()
    return root / project_id_from_repo(repo_path)


def store_path(analysis_dir: Path) -> Path:
    """Return the DuckDB store file path for one project."""
    return analysis_dir / "history.duckdb"


def worktree_path(analysis_dir: Path) -> Path:
    """Return the isolated git worktree directory for one project."""
    return analysis_dir / "worktree"


def lock_path(analysis_dir: Path) -> Path:
    """Return the write-lock file path for one project."""
    return analysis_dir / "writer.lock"


def ensure_analysis_dir(analysis_dir: Path) -> Path:
    """Create the analysis directory if missing and return it."""
    analysis_dir.mkdir(parents=True, exist_ok=True)
    return analysis_dir


def assert_outside_repo(repo_path: Path, artifact_path: Path) -> None:
    """Raise if an artifact path lies inside the analyzed repository."""
    repo = repo_path.resolve()
    artifact = artifact_path.resolve()
    if artifact == repo or repo in artifact.parents:
        raise ValueError(f"Analysis artifact must stay outside repository: {artifact}")
