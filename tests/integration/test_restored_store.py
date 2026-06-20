"""Integration tests for restored metrics persistence and .ppi store."""

from __future__ import annotations

import subprocess
from pathlib import Path

import duckdb
from click.testing import CliRunner

from ppi.cli.main import cli
from ppi.runtime.paths import in_project_store_dir, store_path, worktree_path, writer_lock_path


def _analyze(repo: Path, analysis_dir: Path) -> None:
    """Run analyze on a repository."""
    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "--repo",
            str(repo),
            "--branch",
            "HEAD",
            "--analysis-dir",
            str(analysis_dir),
            "analyze",
        ],
    )
    assert result.exit_code == 0, result.output


def test_restored_metrics_persisted(odoo_sample_repo: Path, tmp_path: Path):
    """Analyze odoo_sample and assert v2 rows exist in DuckDB."""
    analysis_dir = tmp_path / "analysis"
    _analyze(odoo_sample_repo, analysis_dir)
    store_file = store_path(odoo_sample_repo)
    assert store_file.is_file()
    connection = duckdb.connect(str(store_file), read_only=True)
    try:
        commit_hash = connection.execute(
            "SELECT commit_hash FROM commit ORDER BY commit_order DESC LIMIT 1",
        ).fetchone()[0]
        evidence = connection.execute(
            """
            SELECT kind, file_path, line, detail
            FROM coupling_edge_evidence
            WHERE commit_hash = ? AND source_module = 'linked_module'
              AND target_module = 'base_module'
            """,
            [commit_hash],
        ).fetchall()
        assert evidence
        breakdown = connection.execute(
            """
            SELECT model_reuse, extension_or_method, view, field_property, total
            FROM coupling_edge_breakdown
            WHERE commit_hash = ? AND source_module = 'linked_module'
              AND target_module = 'base_module'
            """,
            [commit_hash],
        ).fetchone()
        assert breakdown is not None
        assert breakdown[4] >= 1
        models = connection.execute(
            """
            SELECT model_name, relation
            FROM module_model
            WHERE commit_hash = ? AND module_name = 'base_module'
            ORDER BY model_name
            """,
            [commit_hash],
        ).fetchall()
        assert ("base.partner", "declared") in models
        top_folder = connection.execute(
            """
            SELECT top_folder FROM file_metric
            WHERE commit_hash = ? AND module_name = 'base_module'
              AND relative_path LIKE 'models/%'
            LIMIT 1
            """,
            [commit_hash],
        ).fetchone()
        assert top_folder is not None
        assert top_folder[0] == "models"
        python_file_count = connection.execute(
            """
            SELECT python_file_count FROM module_aggregate
            WHERE commit_hash = ? AND module_name = 'base_module'
            """,
            [commit_hash],
        ).fetchone()[0]
        assert python_file_count >= 1
        kind_rows = connection.execute(
            """
            SELECT k.kind, e.score
            FROM coupling_edge_kind k
            JOIN coupling_edge e
              ON e.commit_hash = k.commit_hash
             AND e.source_module = k.source_module
             AND e.target_module = k.target_module
            WHERE k.commit_hash = ?
              AND k.source_module = 'linked_module'
              AND k.target_module = 'base_module'
            """,
            [commit_hash],
        ).fetchall()
        kinds = {kind for kind, _ in kind_rows}
        assert "manifest_depends" in kinds
        assert any(kind.startswith("security_") for kind in kinds)
    finally:
        connection.close()


def test_ppi_store_layout(odoo_sample_repo: Path, tmp_path: Path):
    """Assert in-project .ppi layout and untracked store artifacts."""
    analysis_dir = tmp_path / "analysis"
    _analyze(odoo_sample_repo, analysis_dir)
    ppi_dir = in_project_store_dir(odoo_sample_repo)
    assert ppi_dir.is_dir()
    assert (ppi_dir / "history.duckdb").is_file()
    gitignore = (ppi_dir / ".gitignore").read_text(encoding="utf-8").strip()
    assert gitignore == "*"
    tracked = subprocess.run(
        ["git", "-C", str(odoo_sample_repo), "ls-files", ".ppi"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert tracked.stdout.strip() == ""
    assert not worktree_path(analysis_dir).exists() or worktree_path(analysis_dir).is_dir()
    assert not str(worktree_path(analysis_dir)).startswith(str(odoo_sample_repo))
    assert not str(writer_lock_path(odoo_sample_repo)).startswith(str(odoo_sample_repo))


def test_unwritable_ppi_fails_fast(odoo_sample_repo: Path, tmp_path: Path):
    """Analyze fails fast when the in-project .ppi directory is not writable."""
    ppi_dir = in_project_store_dir(odoo_sample_repo)
    ppi_dir.mkdir(parents=True, exist_ok=True)
    (ppi_dir / ".gitignore").write_text("*\n", encoding="utf-8")
    ppi_dir.chmod(0o555)
    try:
        runner = CliRunner()
        result = runner.invoke(
            cli,
            [
                "--repo",
                str(odoo_sample_repo),
                "--branch",
                "HEAD",
                "--analysis-dir",
                str(tmp_path / "analysis"),
                "analyze",
            ],
        )
        assert result.exit_code != 0
        assert "Cannot write to .ppi directory" in result.output
    finally:
        ppi_dir.chmod(0o755)
