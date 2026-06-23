"""Parameter coercion helpers and the dispatcher error type.

Split out of :mod:`ppi.query.dispatch` so the dispatcher module is the router +
endpoint table, not a flat file mixing coercion with business shaping (D5).

The ``_opt_*`` helpers coerce ``str|bool|int|float`` because ``params`` is
shape-polymorphic across transports (JSON bools from ``ppi rpc`` vs strings from
HTTP query strings); a per-method typed struct would make the boundary explicit
but is deferred to keep the surface simple (review D2).
"""

from __future__ import annotations


class QueryError(Exception):
    """A dispatcher failure carrying an RPC error code and HTTP-equivalent status."""

    def __init__(self, code: str, message: str, *, http_status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status


def _req(params: dict, key: str) -> str:
    """Return a required string parameter or raise INVALID_PARAMS."""
    value = params.get(key)
    if not value:
        raise QueryError("INVALID_PARAMS", f"{key} is required", http_status=422)
    return str(value)


def _opt_str(params: dict, key: str) -> str | None:
    """Return an optional string parameter as str or None."""
    value = params.get(key)
    return str(value) if value not in (None, "") else None


def _opt_int(params: dict, key: str, default: int) -> int:
    """Return an optional integer parameter, coerced from str/int."""
    value = params.get(key)
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise QueryError("INVALID_PARAMS", f"{key} must be an integer", http_status=422) from exc


def _opt_bool(params: dict, key: str, default: bool = False) -> bool:
    """Return an optional boolean parameter coerced from str/bool/int."""
    value = params.get(key)
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).lower() in {"1", "true", "yes", "on"}


def _choice(params: dict, key: str, allowed: set[str], default: str | None = None) -> str:
    """Return a parameter constrained to an allowed set."""
    value = params.get(key, default)
    if value is None or value == "":
        if default is None:
            raise QueryError("INVALID_PARAMS", f"{key} is required", http_status=422)
        value = default
    value = str(value)
    if value not in allowed:
        raise QueryError(
            "INVALID_PARAMS", f"{key} must be one of {sorted(allowed)}", http_status=422
        )
    return value


__all__ = [
    "QueryError",
    "_choice",
    "_opt_bool",
    "_opt_int",
    "_opt_str",
    "_req",
]
