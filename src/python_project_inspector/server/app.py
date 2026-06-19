"""FastAPI application factory."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from python_project_inspector.server import api

STATIC_DIR = Path(__file__).resolve().parent / "static"
FRONTEND_DIST = Path(__file__).resolve().parents[3] / "frontend" / "dist"


def _static_dir() -> Path | None:
    """Return the dashboard static root, preferring a built frontend bundle."""
    if (FRONTEND_DIST / "index.html").is_file():
        return FRONTEND_DIST
    if STATIC_DIR.is_dir():
        return STATIC_DIR
    return None


def create_app(store_file: Path, lock_file: Path) -> FastAPI:
    """Build a read-only dashboard API over one store."""
    app = FastAPI(title="Python Project Inspector")
    app.state.store_file = store_file
    app.state.lock_file = lock_file
    app.include_router(api.router, prefix="/api")
    static_dir = _static_dir()
    if static_dir is not None:
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app
