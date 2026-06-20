"""Shared pytest fixtures."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
ODOO_SAMPLE_SRC = FIXTURES_DIR / "odoo_sample"


def _init_git_repo(repo: Path, *, extra_commit: bool = False) -> None:
    """Initialize a git repository with one or two commits."""
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Test"], check=True)
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-m", "init"], check=True, capture_output=True)
    if extra_commit:
        order_file = repo / "linked_module" / "models" / "order.py"
        order_file.write_text(
            order_file.read_text(encoding="utf-8").replace(
                'partner_id = fields.Many2one("base.partner")',
                'partner_id = fields.Many2one("base.partner")\n\n    note = fields.Char()',
            ),
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", str(repo), "add", "."], check=True, capture_output=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-m", "extend order"], check=True, capture_output=True)


@pytest.fixture()
def odoo_sample_repo(tmp_path: Path) -> Path:
    """Copy the committed Odoo sample fixture into a temporary git repository."""
    repo = tmp_path / "odoo_sample"
    shutil.copytree(ODOO_SAMPLE_SRC, repo, ignore=shutil.ignore_patterns(".ppi"))
    _init_git_repo(repo, extra_commit=True)
    return repo


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
