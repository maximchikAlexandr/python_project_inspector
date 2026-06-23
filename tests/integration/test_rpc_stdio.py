"""Integration tests for the `ppi rpc` stdio JSON-RPC servant (FR-023/024)."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


def _rpc(repo: Path, analysis_dir: Path, requests: list[dict]) -> list[dict]:
    """Run `ppi rpc` with the given requests and return parsed response lines."""
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


def test_rpc_rejects_unknown_method(mini_repo: Path, tmp_path: Path):
    """An unknown method returns a METHOD_NOT_FOUND error, not a crash."""
    resps = _rpc(mini_repo, tmp_path / "analysis", [{"id": 1, "method": "nope", "params": {}}])
    assert resps[0]["id"] == 1
    assert resps[0]["error"]["code"] == "METHOD_NOT_FOUND"


def test_rpc_store_not_found_when_no_store(mini_repo: Path, tmp_path: Path):
    """A data method against a missing store returns STORE_NOT_FOUND."""
    resps = _rpc(mini_repo, tmp_path / "analysis", [{"id": 2, "method": "graph", "params": {}}])
    assert resps[0]["error"]["code"] == "STORE_NOT_FOUND"


def test_rpc_status_correlates_by_id(mini_repo: Path, tmp_path: Path):
    """Responses carry the request id even for the status method with no store."""
    resps = _rpc(
        mini_repo,
        tmp_path / "analysis",
        [
            {"id": 41, "method": "status", "params": {}},
            {"id": 42, "method": "status", "params": {}},
        ],
    )
    assert [r["id"] for r in resps] == [41, 42]
    for r in resps:
        assert r["result"]["store_present"] is False


def test_rpc_malformed_request_returns_invalid_params(mini_repo: Path, tmp_path: Path):
    """A non-JSON line yields an INVALID_PARAMS error without crashing the servant."""
    ppi = shutil.which("ppi")
    assert ppi
    proc = subprocess.run(
        [ppi, "--repo", str(mini_repo), "--analysis-dir", str(tmp_path / "analysis"), "rpc"],
        input="not json\n{\"method\":\"rpc.close\"}\n",
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parents[2]),
    )
    assert proc.returncode == 0, proc.stderr
    lines = [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]
    assert lines[0]["error"]["code"] == "INVALID_PARAMS"
