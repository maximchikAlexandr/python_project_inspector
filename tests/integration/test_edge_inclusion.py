"""Integration tests for shared edge-inclusion rule."""

from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner

from ppi.cli.main import cli
from ppi.runtime.paths import store_path
from ppi.storage.queries import StoreReader


def test_scoped_analysis_limits_modules(odoo_sample_repo: Path, tmp_path: Path):
    """Module scope filtering persists only in-scope modules."""
    analysis_dir = tmp_path / "analysis"
    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "--repo",
            str(odoo_sample_repo),
            "--branch",
            "HEAD",
            "--analysis-dir",
            str(analysis_dir),
            "analyze",
            "--include-module",
            "base_module",
        ],
    )
    assert result.exit_code == 0, result.output
    reader = StoreReader(store_path(odoo_sample_repo), read_only=True)
    try:
        rows = reader.snapshot_table_modules()
        names = {row["module_name"] for row in rows}
        assert names == {"base_module"}
    finally:
        reader.close()