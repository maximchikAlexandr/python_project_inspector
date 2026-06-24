"""Shared, FastAPI-free query dispatcher for the dashboard read surface.

Both ``ppi serve`` (HTTP) and ``ppi rpc`` (stdio JSON-RPC) route dashboard reads
through this module so behavior is identical (Spec FR-008/SC-003). The dispatcher
returns pydantic ``schemas`` model instances (or plain dicts/lists) so both
transports serialize the same JSON. HTTP-specific concerns (status codes,
opening the store) live in the callers; this module owns the writer-lock check,
schema-error normalization, and raises ``QueryError`` for invalid input or
missing data.

Endpoint handlers live in :mod:`ppi.query._handlers`; this module owns only the
method table, the router, ``build_status``, and error normalization.
"""

from __future__ import annotations

from typing import Any

from ppi.query import _handlers as h
from ppi.query import schemas
from ppi.query._params import QueryError
from ppi.storage import schema
from ppi.storage.queries import QueryNotFoundError, StoreReader

DATA_METHODS = {
    "commits",
    "catalog",
    "metrics/timeseries",
    "hotspots",
    "structure/timeseries",
    "edges",
    "snapshot/modules",
    "snapshot/files",
    "snapshot/module",
    "snapshot/file",
    "graph",
    "edge-points",
    "edge-points/batch",
    "edge-evidence",
    "models",
    "depends",
    "failures",
    "edge-kinds/timeseries",
    "relations/diff",
}

ALL_METHODS = DATA_METHODS | {"status"}

_METHOD_TABLE = {
    "commits": h.commits,
    "catalog": h.catalog,
    "metrics/timeseries": h.metrics_timeseries,
    "hotspots": h.hotspots,
    "structure/timeseries": h.structure_timeseries,
    "edges": h.edges,
    "snapshot/modules": h.snapshot_modules,
    "snapshot/files": h.snapshot_files,
    "snapshot/module": h.snapshot_module,
    "snapshot/file": h.snapshot_file,
    "graph": h.graph,
    "edge-points": h.edge_points,
    "edge-points/batch": h.edge_points_batch,
    "edge-evidence": h.edge_evidence,
    "models": h.models,
    "depends": h.depends,
    "failures": h.failures,
    "edge-kinds/timeseries": h.edge_kind_timeseries,
    "relations/diff": h.relations_diff,
}


def build_status(
    *,
    reader: StoreReader | None,
    store_present: bool,
    writer_active: bool,
    schema_error: schema.SchemaIncompatibleError | None = None,
) -> schemas.StatusResponse:
    """Build the status response (mirror of the HTTP ``/status`` endpoint)."""
    resolved_version = schema_error.stored if schema_error is not None else schema.SCHEMA_VERSION
    compatible = schema_error is None
    if reader is None:
        return schemas.StatusResponse(
            project_id=None,
            branch=None,
            schema_version=resolved_version,
            expected_schema_version=schema.SCHEMA_VERSION,
            schema_compatible=compatible,
            store_present=store_present,
            writer_active=writer_active,
            commit_count=0,
            last_run=None,
            run_failures=[],
        )
    project = reader.get_project()
    last_run = reader.last_run()
    run_failures: list[schemas.RunFailureResponse] = []
    if last_run and last_run["commits_failed"] > 0:
        run_failures = [
            schemas.RunFailureResponse(**row) for row in reader.failures_for_run(last_run["run_id"])
        ]
    scope = None
    if project is not None:
        scope = schemas.ScopeResponse(
            project_label=project.scope.project_label,
            module_prefixes=list(project.scope.module_prefixes),
            include_modules=list(project.scope.include_modules),
            all_modules=project.scope.all_modules,
            repo_path=project.repo_path,
        )
    return schemas.StatusResponse(
        project_id=project.project_id if project is not None else None,
        branch=project.branch if project is not None else None,
        schema_version=reader.schema_version(),
        expected_schema_version=schema.SCHEMA_VERSION,
        schema_compatible=True,
        store_present=store_present,
        writer_active=writer_active,
        commit_count=reader.commit_count(),
        last_run=schemas.LastRunResponse(**last_run) if last_run else None,
        run_failures=run_failures,
        scope=scope,
    )


def dispatch(
    reader: StoreReader | None,
    method: str,
    params: dict,
    *,
    writer_active: bool = False,
    store_present: bool = True,
    schema_error: schema.SchemaIncompatibleError | None = None,
) -> Any:
    """Resolve one dashboard read to its schema model(s) or raise ``QueryError``.

    Owns every method including ``status``. The caller opens the reader (or
    captures a schema error) and passes transport-specific context; this module
    centralizes method dispatch, the writer-lock check, and error normalization.
    """
    if method not in ALL_METHODS:
        raise QueryError("METHOD_NOT_FOUND", f"unknown method: {method}", http_status=404)
    if method == "status":
        return build_status(
            reader=reader,
            store_present=store_present,
            writer_active=writer_active,
            schema_error=schema_error,
        )
    if writer_active:
        raise QueryError("LOCKED", "analysis in progress", http_status=409)
    if schema_error is not None:
        raise QueryError(
            "SCHEMA_INCOMPATIBLE", str(schema_error), http_status=503
        ) from schema_error
    if reader is None:
        raise QueryError("STORE_NOT_FOUND", "store not found", http_status=503)
    try:
        return _METHOD_TABLE[method](reader, params)
    except QueryError:
        raise
    except QueryNotFoundError as exc:
        raise QueryError("QUERY_NOT_FOUND", str(exc), http_status=404) from exc
    except schema.SchemaIncompatibleError as exc:
        raise QueryError("SCHEMA_INCOMPATIBLE", str(exc), http_status=503) from exc
    except Exception as exc:  # noqa: BLE001
        raise QueryError("INTERNAL", str(exc), http_status=500) from exc
