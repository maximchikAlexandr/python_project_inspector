"""msgspec contracts for the read-only stdio JSON-RPC servant (``ppi rpc``)."""

from __future__ import annotations

import msgspec


class RpcRequest(msgspec.Struct, frozen=True, kw_only=True):
    """One JSON-RPC request line read from stdin."""

    method: str
    id: int = 0
    # ``params`` is intentionally shape-polymorphic: the rpc side receives real JSON
    # types (e.g. ``include_zero_score`` as a bool), while the HTTP query-string side
    # delivers strings. The dispatcher coerces via the ``_opt_*`` helpers in
    # ``ppi.query._params`` rather than per-method typed structs (kept simple for now).
    params: dict = {}

