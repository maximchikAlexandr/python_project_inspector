"""FastAPI-free shared query dispatcher for the dashboard read surface."""

from __future__ import annotations

from ppi.query.dispatch import QueryError, build_status, dispatch

__all__ = ["QueryError", "build_status", "dispatch"]
