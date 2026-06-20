"""Contract tests for restored HTTP snapshot and parity endpoints."""

from __future__ import annotations

import json
from pathlib import Path

from click.testing import CliRunner
from fastapi.testclient import TestClient

from ppi.cli.main import cli
from ppi.runtime.paths import store_path, writer_lock_path
from ppi.server.app import create_app


def _analyze_odoo_sample(repo: Path, analysis_dir: Path) -> TestClient:
    """Analyze odoo_sample and return an API client."""
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


def _first_edge(client: TestClient) -> tuple[str, str]:
    """Return the first coupling edge source and target from the store."""
    payload = client.get("/api/edges", params={"min_score": 0}).json()
    edge = payload["edges"][0]
    return edge["source"], edge["target"]


def _commit_hashes(client: TestClient) -> tuple[str, str]:
    """Return the first and last commit hashes."""
    commits = client.get("/api/commits").json()
    return commits[0]["commit_hash"], commits[-1]["commit_hash"]


def test_http_snapshot_file_detail(odoo_sample_repo: Path, tmp_path: Path):
    """File snapshot endpoint returns top_folder and distributions."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    files = client.get("/api/snapshot/files").json()["files"]
    sample = files[0]
    path = f"{sample['module_name']}/{sample['relative_path']}"
    response = client.get("/api/snapshot/file", params={"name": path})
    assert response.status_code == 200
    body = response.json()
    assert body["file"]["top_folder"]
    assert "cyclomatic" in body["file"]


def test_http_failures_and_relations_diff(odoo_sample_repo: Path, tmp_path: Path):
    """Failures and relations diff endpoints return contract shapes."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    failures = client.get("/api/failures")
    assert failures.status_code == 200
    assert "failures" in failures.json()
    commit_a, commit_b = _commit_hashes(client)
    diff = client.get("/api/relations/diff", params={"commit_a": commit_a, "commit_b": commit_b})
    assert diff.status_code == 200
    body = diff.json()
    assert body["commit_a"] == commit_a
    assert body["commit_b"] == commit_b
    assert isinstance(body["changes"], list)


def test_http_edge_points_and_evidence(odoo_sample_repo: Path, tmp_path: Path):
    """Edge points and edge evidence endpoints return breakdown and evidence rows."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    source, target = _first_edge(client)
    points = client.get("/api/edge-points", params={"source": source, "target": target})
    assert points.status_code == 200
    body = points.json()
    assert body["breakdown"]["total"] >= 0
    assert body["points"]
    assert any(point.get("why_points") for point in body["points"])
    evidence = client.get("/api/edge-evidence", params={"source": source, "target": target})
    assert evidence.status_code == 200
    evidence_body = evidence.json()
    assert evidence_body["source"] == source
    assert evidence_body["target"] == target
    assert evidence_body["evidence"] == body["evidence"]


def test_http_edge_points_batch(odoo_sample_repo: Path, tmp_path: Path):
    """Batch edge-points returns the same payloads as single lookups."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    source, target = _first_edge(client)
    single = client.get("/api/edge-points", params={"source": source, "target": target}).json()
    batch = client.post(
        "/api/edge-points/batch",
        json={"pairs": [{"source": source, "target": target}]},
    )
    assert batch.status_code == 200
    edges = batch.json()["edges"]
    assert len(edges) == 1
    assert edges[0]["source"] == single["source"]
    assert edges[0]["target"] == single["target"]
    assert edges[0]["breakdown"] == single["breakdown"]
    assert edges[0]["evidence"] == single["evidence"]


def test_http_edge_points_batch_missing_and_cap(odoo_sample_repo: Path, tmp_path: Path):
    """Batch reports missing pairs and rejects oversized requests."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    batch = client.post(
        "/api/edge-points/batch",
        json={"pairs": [{"source": "missing_a", "target": "missing_b"}]},
    )
    assert batch.status_code == 200
    body = batch.json()
    assert body["missing"] == [{"source": "missing_a", "target": "missing_b"}]
    assert body["edges"] == []
    oversized = client.post(
        "/api/edge-points/batch",
        json={"pairs": [{"source": f"s{i}", "target": f"t{i}"} for i in range(501)]},
    )
    assert oversized.status_code == 422


def test_http_models_and_depends(odoo_sample_repo: Path, tmp_path: Path):
    """Models and manifest depends endpoints match CLI read shapes."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    models = client.get("/api/models", params={"module": "linked_module"})
    assert models.status_code == 200
    models_body = models.json()
    assert models_body["module_name"] == "linked_module"
    assert isinstance(models_body["declared_models"], list)
    depends = client.get("/api/depends", params={"module": "linked_module"})
    assert depends.status_code == 200
    assert depends.json()["depends_on"] == ["base_module"]
    bulk = client.get("/api/depends")
    assert bulk.status_code == 200
    assert isinstance(bulk.json()["depends"], list)


def test_http_edges_include_zero_score_and_counts(odoo_sample_repo: Path, tmp_path: Path):
    """Extended edges response exposes FR-008 count fields."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    scored = client.get("/api/edges").json()["edges"]
    all_edges = client.get("/api/edges", params={"include_zero_score": True}).json()["edges"]
    assert len(all_edges) >= len(scored)
    if scored:
        edge = scored[0]
        assert "kind_occurrence_count" in edge
        assert "evidence_count" in edge


def test_unknown_file_returns_404(odoo_sample_repo: Path, tmp_path: Path):
    """Unknown file selector returns 404 on HTTP and CLI."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get("/api/snapshot/file", params={"name": "missing_module/foo.py"})
    assert response.status_code == 404
    runner = CliRunner()
    cli_result = runner.invoke(
        cli,
        [
            "--repo",
            str(odoo_sample_repo),
            "--analysis-dir",
            str(tmp_path / "analysis"),
            "query",
            "--metric",
            "file-detail",
            "--file",
            "missing_module/foo.py",
        ],
    )
    assert cli_result.exit_code != 0
    assert "Unknown file" in cli_result.output


def test_unknown_edge_returns_404(odoo_sample_repo: Path, tmp_path: Path):
    """Unknown edge pair returns 404 on HTTP and CLI."""
    client = _analyze_odoo_sample(odoo_sample_repo, tmp_path / "analysis")
    response = client.get(
        "/api/edge-points",
        params={"source": "missing_a", "target": "missing_b"},
    )
    assert response.status_code == 404
    runner = CliRunner()
    cli_result = runner.invoke(
        cli,
        [
            "--repo",
            str(odoo_sample_repo),
            "--analysis-dir",
            str(tmp_path / "analysis"),
            "query",
            "--metric",
            "edge-points",
            "--source",
            "missing_a",
            "--target",
            "missing_b",
        ],
    )
    assert cli_result.exit_code != 0
    assert "Unknown edge" in cli_result.output


def test_cli_api_failures_parity(odoo_sample_repo: Path, tmp_path: Path):
    """CLI and API failures payloads match."""
    analysis_dir = tmp_path / "analysis"
    client = _analyze_odoo_sample(odoo_sample_repo, analysis_dir)
    api_body = client.get("/api/failures").json()
    runner = CliRunner()
    cli_result = runner.invoke(
        cli,
        [
            "--repo",
            str(odoo_sample_repo),
            "--analysis-dir",
            str(analysis_dir),
            "query",
            "--metric",
            "failures",
            "--format",
            "json",
        ],
    )
    assert cli_result.exit_code == 0, cli_result.output
    assert json.loads(cli_result.output) == api_body
