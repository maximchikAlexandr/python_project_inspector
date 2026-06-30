"""Contract test: the TS ``ALLOWED_RPC_METHODS`` allowlist in the VS Code extension
stays in sync with the Python ``QueryMethod`` enum (review #22 drift guard).

The allowlist is a defensive set of read-only methods the dashboard webview may
invoke through the bridge. If the Python CLI adds a read method and the TS
allowlist is not updated, the dashboard silently 422s with ``METHOD_NOT_ALLOWED``.
This test parses the TS source and asserts the allowlist is a superset of
``ALL_METHODS`` from :mod:`ppi.query.dispatch`.
"""

from __future__ import annotations

import re
from pathlib import Path

from ppi.query.dispatch import ALL_METHODS


_REPO_ROOT = Path(__file__).resolve().parents[2]
_TS_FILE = _REPO_ROOT / "vscode-extension" / "src" / "webviewPanel.ts"


def _parse_ts_allowlist() -> set[str]:
    """Extract the string literals from ``ALLOWED_RPC_METHODS = new Set([...])``."""
    source = _TS_FILE.read_text(encoding="utf-8")
    match = re.search(r"ALLOWED_RPC_METHODS\s*=\s*new Set\(\[(.*?)\]\)", source, re.DOTALL)
    assert match, "ALLOWED_RPC_METHODS set not found in webviewPanel.ts"
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def test_ts_allowlist_covers_all_python_query_methods() -> None:
    """The TS allowlist MUST include every method in the Python ``ALL_METHODS`` set."""
    ts_methods = _parse_ts_allowlist()
    python_methods = {m.value for m in ALL_METHODS}
    missing = python_methods - ts_methods
    assert not missing, (
        f"TS ALLOWED_RPC_METHODS is missing Python query methods: {sorted(missing)}. "
        f"Update vscode-extension/src/webviewPanel.ts ALLOWED_RPC_METHODS to include them."
    )


def test_ts_allowlist_has_no_extra_unknown_methods() -> None:
    """The TS allowlist SHOULD NOT contain methods not in the Python ``ALL_METHODS`` set."""
    ts_methods = _parse_ts_allowlist()
    python_methods = {m.value for m in ALL_METHODS}
    extra = ts_methods - python_methods
    assert not extra, (
        f"TS ALLOWED_RPC_METHODS contains methods not in Python QueryMethod: {sorted(extra)}. "
        f"Remove them or add them to the Python QueryMethod enum."
    )