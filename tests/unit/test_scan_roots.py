"""Tests for worktree scan root resolution."""

from pathlib import Path

from ppi.history.walker import _resolve_scan_roots


def test_resolve_scan_roots_defaults_to_worktree(tmp_path: Path):
    """Empty addons paths scan the whole worktree."""
    worktree = tmp_path / "wt"
    worktree.mkdir()
    result = _resolve_scan_roots(worktree, ())
    assert result.is_ok()
    assert result.ok == (worktree,)


def test_resolve_scan_roots_rejects_escape(tmp_path: Path):
    """Absolute or relative paths outside the worktree are rejected."""
    worktree = tmp_path / "wt"
    worktree.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    absolute = _resolve_scan_roots(worktree, (str(outside),))
    assert absolute.is_error()
    relative = _resolve_scan_roots(worktree, ("../outside",))
    assert relative.is_error()
