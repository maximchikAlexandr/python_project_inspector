"""Tests for repo-scoped writer lock paths."""

from __future__ import annotations

from pathlib import Path

from ppi.runtime.paths import analysis_dir_for_repo, lock_path, writer_lock_path


def test_writer_lock_path_uses_canonical_analysis_dir(tmp_path: Path):
    """Writer lock stays on the repo-derived analysis dir, not a custom override."""
    repo = tmp_path / "repo"
    repo.mkdir()
    custom_analysis = tmp_path / "custom-analysis"
    custom_analysis.mkdir()
    assert writer_lock_path(repo) == lock_path(analysis_dir_for_repo(repo))
    assert writer_lock_path(repo) != lock_path(custom_analysis)
