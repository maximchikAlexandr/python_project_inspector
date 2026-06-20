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
    return Path.home() / ".local" / "share" / "ppi"


def analysis_dir_for_repo(repo_path: Path, analysis_root: Path | None = None) -> Path:
    """Return the user-level analysis directory for one repository."""
    root = analysis_root or default_analysis_root()
    return root / project_id_from_repo(repo_path)


def in_project_store_dir(repo_path: Path) -> Path:
    """Return the in-project `.ppi` directory for one repository."""
    return repo_path.resolve() / ".ppi"


def store_path(repo_path: Path) -> Path:
    """Return the DuckDB store file path inside the analyzed repository."""
    return in_project_store_dir(repo_path) / "history.duckdb"


def worktree_path(analysis_dir: Path) -> Path:
    """Return the isolated git worktree directory for one project."""
    return analysis_dir / "worktree"


def lock_path(analysis_dir: Path) -> Path:
    """Return the write-lock file path for one project."""
    return analysis_dir / "writer.lock"


def writer_lock_path(repo_path: Path) -> Path:
    """Return the canonical writer lock for one repository's store."""
    return lock_path(analysis_dir_for_repo(repo_path))


def ensure_analysis_dir(analysis_dir: Path) -> Path:
    """Create the analysis directory if missing and return it."""
    analysis_dir.mkdir(parents=True, exist_ok=True)
    return analysis_dir


def ensure_in_project_store(repo_path: Path) -> Path:
    """Create `.ppi/` with a self-ignoring `.gitignore` and return the store path."""
    store_dir = in_project_store_dir(repo_path)
    try:
        store_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ValueError(f"Cannot create .ppi directory: {exc}") from exc
    gitignore = store_dir / ".gitignore"
    if not gitignore.is_file() or "*" not in gitignore.read_text(encoding="utf-8").splitlines():
        gitignore.write_text("*\n", encoding="utf-8")
    try:
        probe = store_dir / ".write_test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as exc:
        raise ValueError(f"Cannot write to .ppi directory: {exc}") from exc
    return store_path(repo_path)


def assert_outside_repo(repo_path: Path, artifact_path: Path) -> None:
    """Raise if an artifact path lies inside the analyzed repository."""
    repo = repo_path.resolve()
    artifact = artifact_path.resolve()
    if artifact == store_path(repo):
        return
    if artifact == repo or repo in artifact.parents:
        raise ValueError(f"Analysis artifact must stay outside repository: {artifact}")
