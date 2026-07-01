"""Contract test: `ppi rpc` (dispatch) returns JSON equivalent to `ppi serve` (SC-003)."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from click.testing import CliRunner
from fastapi.testclient import TestClient

from ppi.cli.main import cli
from ppi.runtime.paths import store_path, writer_lock_path
from ppi.server.app import create_app


def _analyze(repo: Path, analysis_dir: Path) -> None:
    """Run an initial analysis to populate the store."""
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


def _rpc(repo: Path, analysis_dir: Path, requests: list[dict]) -> list[dict]:
    """Run `ppi rpc` feeding requests and return parsed responses in order."""
    payload = "\n".join(json.dumps(r) for r in requests) + "\n"
    ppi = shutil.which("ppi")
    assert ppi, "ppi console script not on PATH"
    proc = subprocess.run(
        [ppi, "--repo", str(repo), "--analysis-dir", str(analysis_dir), "rpc"],
        input=payload,
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parents[2]),
    )
    assert proc.returncode == 0, proc.stderr
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


def _normalize(value: Any) -> Any:
    """Round-trip through JSON to normalize key order and types."""
    return json.loads(json.dumps(value, sort_keys=True, default=str))


def test_rpc_matches_serve_for_all_methods(odoo_sample_repo: Path, tmp_path: Path):
    """Every dashboard method returns equivalent JSON over RPC and HTTP."""
    analysis_dir = tmp_path / "analysis"
    _analyze(odoo_sample_repo, analysis_dir)

    client = TestClient(
        create_app(store_path(odoo_sample_repo), writer_lock_path(odoo_sample_repo))
    )

    def http(method: str, params: dict) -> Any:
        query = "&".join(f"{k}={v}" for k, v in params.items() if v is not None and v != "")
        url = f"/api/{method}" + (f"?{query}" if query else "")
        return client.get(url).json()

    # Methods with static params.
    cases: list[tuple[str, dict]] = [
        ("project/info", {}),
        ("commits", {}),
        ("ui/config", {}),
        (
            "metrics/timeseries",
            {"level": "module", "metric_id": "cyclomatic", "name": "base_module", "agg": "mean"},
        ),
        (
            "metrics/timeseries",
            {"level": "module", "metric_id": "lines", "name": "base_module", "agg": "mean"},
        ),
        (
            "hotspots",
            {"level": "module", "metric_id": "cyclomatic", "by": "value", "limit": 20, "agg": "mean"},
        ),
        ("snapshot/table/modules", {}),
        ("snapshot/table/files", {}),
        ("snapshot/relations", {}),
        ("graph", {"include_zero_score": "false"}),
    ]

    rpc_reqs = [{"id": i, "method": m, "params": p} for i, (m, p) in enumerate(cases)]
    rpc_resps = _rpc(odoo_sample_repo, analysis_dir, rpc_reqs)

    def _norm_method(method: str, value: Any) -> Any:
        # Hotspot tie-order is non-deterministic in the store query; compare by name.
        if (
            method == "hotspots"
            and isinstance(value, dict)
            and isinstance(value.get("items"), list)
        ):
            return {**value, "items": sorted(value["items"], key=lambda i: i.get("name", ""))}
        return value

    for idx, (method, params) in enumerate(cases):
        http_json = _norm_method(method, _normalize(http(method, params)))
        rpc_json = _norm_method(method, _normalize(rpc_resps[idx].get("result")))
        assert rpc_json == http_json, f"parity mismatch for {method} {params}"