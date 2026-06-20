"""Integration tests for aggregation-aware hotspots."""

from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner
from fastapi.testclient import TestClient

from ppi.cli.main import cli
from ppi.core.contracts import (
    AnalysisBatch,
    CommitRef,
    Distribution,
    ModuleAggregate,
)
from ppi.runtime.paths import store_path, writer_lock_path
from ppi.server.app import create_app
from ppi.storage.queries import StoreReader
from ppi.storage.writer import StoreWriter


def _commit() -> CommitRef:
    """Build a minimal commit ref for hotspot tests."""
    return CommitRef(
        commit_hash="b" * 40,
        commit_order=0,
        author_name="Test",
        author_email="test@example.com",
        authored_at=1,
        committed_at=1,
        summary="init",
    )


def _distribution(*, mean: float, p95: float) -> Distribution:
    """Build a distribution with distinct mean and p95 values."""
    return Distribution(
        count=5,
        mean=mean,
        median=1.0,
        p95=p95,
        max=p95,
    )


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


def test_hotspots_p95_differs_from_mean(tmp_path: Path):
    """Hotspots honor agg and p95 differs from mean when stored values vary."""
    store_file = tmp_path / "history.duckdb"
    writer = StoreWriter(store_file)
    try:
        writer.write_batch(
            AnalysisBatch(
                commit=_commit(),
                files=(),
                modules=(
                    ModuleAggregate(
                        module_name="demo_module",
                        total_lines=10,
                        line_categories={"python_lines": 10},
                        cyclomatic=_distribution(mean=2.0, p95=9.0),
                        cognitive=_distribution(mean=1.0, p95=1.0),
                        jones=_distribution(mean=1.0, p95=1.0),
                        declared_models_count=0,
                        inherited_models_count=0,
                        python_complexity_parse_errors=0,
                        score_out=0,
                        score_in=0,
                    ),
                ),
                edges=(),
                failures=(),
            ),
            "run-1",
        )
    finally:
        writer.close()

    reader = StoreReader(store_file, read_only=True)
    try:
        mean_items = reader.hotspots(level="module", metric="cyclomatic", by="value", agg="mean")
        p95_items = reader.hotspots(level="module", metric="cyclomatic", by="value", agg="p95")
        assert mean_items[0]["current"] == 2.0
        assert p95_items[0]["current"] == 9.0
        assert mean_items[0]["current"] != p95_items[0]["current"]
    finally:
        reader.close()


def test_hotspots_agg_parameter(odoo_sample_repo: Path, tmp_path: Path):
    """Hotspots endpoint accepts mean/median/p95/max aggregations."""
    analysis_dir = tmp_path / "analysis"
    client = _analyze(odoo_sample_repo, analysis_dir)
    responses = {
        agg: client.get(
            "/api/hotspots",
            params={"level": "module", "metric": "cyclomatic", "by": "value", "agg": agg},
        )
        for agg in ("mean", "median", "p95", "max")
    }
    for response in responses.values():
        assert response.status_code == 200
        assert response.json()["items"]
