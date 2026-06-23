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
    """Serve read-only JSON-RPC requests over stdio, reusing one store reader.

    The store reader is opened lazily on first use and held for the loop lifetime
    (no per-request cold-open); it is reopened only after a schema incompatibility
    (contracts/query-rpc.md). All method/lock/store/schema checks are owned by
    ``dispatch``; this loop only decodes, dispatches, and serializes.
    """
    reader: StoreReader | None = None

    def get_reader(
        migrate: bool,
    ) -> tuple[StoreReader | None, schema.SchemaIncompatibleError | None]:
        """Return the cached reader, opening it lazily and capturing schema errors."""
        nonlocal reader
        if reader is not None:
            return reader, None
        store_file = store_path(repo)
        if not store_file.is_file():
            return None, None
        try:
            reader = StoreReader(store_file, read_only=True, migrate=migrate)
            return reader, None
        except schema.SchemaIncompatibleError as exc:
            reader = None
            return None, exc

    try:
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
            writer_active = project_lock.is_locked(writer_lock_path(repo))
            store_present = store_path(repo).is_file()
            rpc_reader, schema_error = get_reader(migrate=not writer_active)
            try:
                result = dispatch(
                    rpc_reader,
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
                if exc.code == "SCHEMA_INCOMPATIBLE" and reader is not None:
                    reader.close()
                    reader = None
                sys.stdout.write(
                    json.dumps(
                        {"id": request.id, "error": {"code": exc.code, "message": exc.message}},
                        ensure_ascii=False,
                    )
                    + "\n"
                )
            sys.stdout.flush()
    finally:
        if reader is not None:
            reader.close()


__all__ = ["serve_rpc"]
