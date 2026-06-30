"""Read-only stdio JSON-RPC servant transport for ``ppi rpc``.

This module owns the transport (decode/encode loop, reader lifecycle, JSON
serialization) so ``ppi.cli.main`` stays a thin command registrar (D4). All
query/lock/store/schema logic is delegated to :func:`ppi.query.dispatch`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import msgspec

from ppi.query import QueryError, dispatch
from ppi.query.contracts import RpcRequest
from ppi.runtime import lock as project_lock
from ppi.runtime.paths import store_path, writer_lock_path
from ppi.storage import schema
from ppi.storage.queries import StoreReader


def _json_default(obj: object) -> object:
    """Serialize pydantic response schemas to JSON-friendly values.

    Single adapter used by the one JSON serializer (``json.dumps``) for both
    success and error envelopes.
    """
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    raise TypeError(f"not serializable: {type(obj)!r}")


def serve_rpc(repo: Path) -> None:
    """Serve read-only JSON-RPC requests over stdio.

    Each request opens a short-lived read-only ``StoreReader`` and closes it
    before writing the response. This is required because the dashboard is
    allowed to stay open while the user starts a new analysis: a long-lived
    read-only DuckDB connection would block the writer (DuckDB allows either
    one read-write process or multiple read-only processes, but not both).
    The RPC servant never migrates the store — schema incompatibilities are
    surfaced as ``SCHEMA_INCOMPATIBLE`` so the user re-runs ``analyze --rebuild``.

    The DuckDB store is read from ``repo/.ppi/history.duckdb`` and the writer lock
    from ``writer_lock_path(repo)``, matching ``ppi analyze`` and ``ppi serve``.
    ``--analysis-dir`` only affects the worktree used by ``analyze``; the
    read-only servant has no worktree and ignores it.
    """
    store_file = store_path(repo)
    lock_file = writer_lock_path(repo)

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            request = msgspec.json.decode(line.encode("utf-8"), type=RpcRequest)
        except msgspec.DecodeError:
            sys.stdout.write(
                json.dumps(
                    {
                        "id": -1,
                        "error": {"code": "INVALID_PARAMS", "message": "malformed request"},
                    }
                )
                + "\n"
            )
            sys.stdout.flush()
            continue
        if request.method == "rpc.close":
            break
        writer_active = project_lock.is_locked(lock_file)
        store_present = store_file.is_file()
        # Open a short-lived read-only reader per request. Never migrate from
        # the read-only servant (#11): surface SCHEMA_INCOMPATIBLE instead.
        reader: StoreReader | None = None
        schema_error: schema.SchemaIncompatibleError | None = None
        if store_present and not writer_active:
            try:
                reader = StoreReader(store_file, read_only=True, migrate=False)
            except schema.SchemaIncompatibleError as exc:
                schema_error = exc
            except OSError:
                # Lock contention, corrupt file, IO error — don't crash the servant.
                pass
        try:
            result = dispatch(
                reader,
                request.method,
                request.params,
                writer_active=writer_active,
                store_present=store_present,
                schema_error=schema_error,
            )
            sys.stdout.write(
                json.dumps(
                    {"id": request.id, "result": result},
                    ensure_ascii=False,
                    default=_json_default,
                )
                + "\n"
            )
        except QueryError as exc:
            sys.stdout.write(
                json.dumps(
                    {"id": request.id, "error": {"code": exc.code, "message": exc.message}},
                    ensure_ascii=False,
                )
                + "\n"
            )
        except (TypeError, ValueError) as exc:
            # Serialization failure or unserializable result — keep the servant alive.
            sys.stdout.write(
                json.dumps(
                    {"id": request.id, "error": {"code": "INTERNAL", "message": f"serialization failed: {exc}"}},
                    ensure_ascii=False,
                )
                + "\n"
            )
        finally:
            if reader is not None:
                reader.close()
        sys.stdout.flush()


__all__ = ["serve_rpc"]
