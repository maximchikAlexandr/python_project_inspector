"""Shared, FastAPI-free query dispatcher for the dashboard read surface.

Both ``ppi serve`` (HTTP) and ``ppi rpc`` (stdio JSON-RPC) route dashboard reads
through this module so behavior is identical (Spec FR-008/SC-003). The dispatcher
returns pydantic ``schemas`` model instances (or plain dicts/lists) so both
transports serialize the same JSON. HTTP-specific concerns (status codes,
opening the store) live in the callers; this module owns the writer-lock check,
schema-error normalization, and raises ``QueryError`` for invalid input or
missing data.

Endpoint handlers live in :mod:`ppi.query._handlers`; this module owns only the
method table, the router, ``build_project_info``, and error normalization. Method
names are typed via :class:`QueryMethod` (PPI-045) and dispatched via a typed
table; string methods remain only at the HTTP/RPC decoder boundary.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from ppi.query import _handlers as h
from ppi.query import schemas
from ppi.query._params import QueryError
from ppi.query.errors import QueryErrorCode, raise_query_failure
from ppi.storage import schema
from ppi.storage.queries import QueryNotFoundError, StoreReader


class QueryMethod(StrEnum):
    """Typed query method names (PPI-045).

    String values stay stable for the HTTP/RPC boundary; inside the dispatcher
    routing uses the typed enum.
    """

    COMMITS = "commits"
    METRICS_TIMESERIES = "metrics/timeseries"
    HOTSPOTS = "hotspots"
    GRAPH = "graph"
    UI_CONFIG = "ui/config"
    SNAPSHOT_TABLE_MODULES = "snapshot/table/modules"
    SNAPSHOT_TABLE_FILES = "snapshot/table/files"
    SNAPSHOT_RELATIONS = "snapshot/relations"
    PROJECT_INFO = "project/info"


DATA_METHODS = {
    QueryMethod.COMMITS,
    QueryMethod.METRICS_TIMESERIES,
    QueryMethod.HOTSPOTS,
    QueryMethod.GRAPH,
    QueryMethod.UI_CONFIG,
    QueryMethod.SNAPSHOT_TABLE_MODULES,
    QueryMethod.SNAPSHOT_TABLE_FILES,
    QueryMethod.SNAPSHOT_RELATIONS,
}

ALL_METHODS = DATA_METHODS | {QueryMethod.PROJECT_INFO}

# Typed handler table: QueryMethod -> handler callable (no string keys).
_METHOD_TABLE: dict[QueryMethod, Any] = {
    QueryMethod.COMMITS: h.commits,
    QueryMethod.METRICS_TIMESERIES: h.metrics_timeseries,
    QueryMethod.HOTSPOTS: h.hotspots,
    QueryMethod.GRAPH: h.graph,
    QueryMethod.UI_CONFIG: h.ui_config,
    QueryMethod.SNAPSHOT_TABLE_MODULES: h.snapshot_table_modules,
    QueryMethod.SNAPSHOT_TABLE_FILES: h.snapshot_table_files,
    QueryMethod.SNAPSHOT_RELATIONS: h.snapshot_relations,
}


def parse_query_method(method: str) -> QueryMethod | None:
    """Parse a string method name into a typed :class:`QueryMethod`, ``None`` if unknown."""
    try:
        return QueryMethod(method)
    except ValueError:
        return None


def build_project_info(
    *,
    reader: StoreReader | None,
    store_present: bool,
    writer_active: bool,
    schema_error: schema.SchemaIncompatibleError | None = None,
) -> schemas.ProjectInfoResponse:
    """Build the project info response."""
    if schema_error is not None:
        return schemas.ProjectInfoResponse(
            project_id=None,
            branch=None,
            commit_count=0,
            schema_version=schema_error.stored,
            store_present=store_present,
        )
    if reader is None:
        return schemas.ProjectInfoResponse(
            project_id=None,
            branch=None,
            commit_count=0,
            schema_version=schema.SCHEMA_VERSION,
            store_present=store_present,
        )
    project = reader.get_project()
    return schemas.ProjectInfoResponse(
        project_id=project.project_id if project is not None else None,
        branch=project.branch if project is not None else None,
        commit_count=reader.commit_count(),
        schema_version=reader.schema_version(),
        store_present=store_present,
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

    Owns every method including ``project/info``. The caller opens the reader (or
    captures a schema error) and passes transport-specific context; this module
    centralizes method dispatch via a typed :class:`QueryMethod` enum, the
    writer-lock check, and error normalization.
    """
    typed = parse_query_method(method)
    if typed is None:
        raise_query_failure(
            QueryErrorCode.METHOD_NOT_FOUND, f"unknown method: {method}", http_status=404
        )
    match typed:
        case QueryMethod.PROJECT_INFO:
            return build_project_info(
                reader=reader,
                store_present=store_present,
                writer_active=writer_active,
                schema_error=schema_error,
            )
        case _:
            pass
    if writer_active:
        raise_query_failure(QueryErrorCode.LOCKED, "analysis in progress", http_status=409)
    if schema_error is not None:
        raise QueryError("SCHEMA_INCOMPATIBLE", str(schema_error), http_status=503)
    if reader is None:
        raise QueryError("STORE_NOT_FOUND", "store not found", http_status=503)
    handler = _METHOD_TABLE[typed]
    try:
        return handler(reader, params)
    except QueryError:
        raise
    except QueryNotFoundError as exc:
        raise QueryError("QUERY_NOT_FOUND", str(exc), http_status=404) from exc
    except schema.SchemaIncompatibleError as exc:
        raise QueryError("SCHEMA_INCOMPATIBLE", str(exc), http_status=503) from exc
    except Exception as exc:  # noqa: BLE001
        raise QueryError("INTERNAL", str(exc), http_status=500) from exc
