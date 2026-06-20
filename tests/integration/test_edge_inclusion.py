"""Integration tests for shared edge-inclusion rule."""

from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner
from fastapi.testclient import TestClient

from ppi.cli.main import cli
from ppi.runtime.paths import store_path, writer_lock_path
from ppi.server.app import create_app
from ppi.storage.queries import StoreReader


def _analyze(repo: Path, analysis_dir: Path) -> TestClient:
    """Analyze a repository and return an API client."""
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
    return TestClient(create_app(store_path(repo), writer_lock_path(repo)))


def _edge_count_for_commit(
    reader: StoreReader, commit_hash: str, *, include_zero_score: bool
) -> int:
    """Count visible edges for one commit."""
    return len(
        reader.edges_at_commit(commit_hash, include_zero_score=include_zero_score),
    )


def test_structure_timeseries_matches_edges(odoo_sample_repo: Path, tmp_path: Path):
    """Structure chart edge counts match edge reads for both inclusion modes."""
    analysis_dir = tmp_path / "analysis"
    client = _analyze(odoo_sample_repo, analysis_dir)
    reader = StoreReader(store_path(odoo_sample_repo), read_only=True)
    try:
        for include_zero_score in (False, True):
            structure = reader.coupling_structure_timeseries(
                include_zero_score=include_zero_score,
            )
            for point in structure:
                assert point["edge_count"] == _edge_count_for_commit(
                    reader,
                    point["commit_hash"],
                    include_zero_score=include_zero_score,
                )
            http_structure = client.get(
                "/api/structure/timeseries",
                params={"include_zero_score": include_zero_score},
            )
            assert http_structure.status_code == 200
            for point in http_structure.json()["points"]:
                http_edges = client.get(
                    "/api/edges",
                    params={
                        "commit": point["commit_hash"],
                        "include_zero_score": include_zero_score,
                    },
                )
                assert http_edges.status_code == 200
                assert len(http_edges.json()["edges"]) == point["edge_count"]
    finally:
        reader.close()


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
        modules = reader.modules_at_commit()["modules"]
        names = {module["module_name"] for module in modules}
        assert names == {"base_module"}
    finally:
        reader.close()
