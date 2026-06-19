"""Shared pytest fixtures."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest


@pytest.fixture()
def mini_repo(tmp_path: Path) -> Path:
    """Create a tiny git repository with two non-merge commits."""
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Test"], check=True)
    module_dir = repo / "demo_module"
    module_dir.mkdir()
    (module_dir / "__manifest__.py").write_text('{"name": "demo", "depends": []}\n', encoding="utf-8")
    (module_dir / "__init__.py").write_text("", encoding="utf-8")
    (module_dir / "models.py").write_text("class Demo:\n    pass\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-m", "init"], check=True, capture_output=True)
    (module_dir / "models.py").write_text(
        "class Demo:\n    def run(self):\n        return 1\n",
        encoding="utf-8",
    )
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-m", "change"], check=True, capture_output=True)
    return repo
