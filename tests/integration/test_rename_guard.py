"""Guard tests for the ppi rename."""

from __future__ import annotations

import importlib.util
import tomllib
from pathlib import Path


def test_old_package_import_unavailable():
    """The old python_project_inspector import path must not be reachable."""
    assert importlib.util.find_spec("python_project_inspector") is None


def test_ppi_importable():
    """The renamed package imports successfully."""
    import ppi

    assert hasattr(ppi, "__doc__")


def test_pyproject_console_script():
    """Only the ppi console script is declared in packaging metadata."""
    pyproject = tomllib.loads(Path("pyproject.toml").read_text(encoding="utf-8"))
    scripts = pyproject["project"]["scripts"]
    assert "ppi" in scripts
    assert "python-project-inspector" not in scripts
    assert scripts["ppi"] == "ppi.cli.main:cli"
