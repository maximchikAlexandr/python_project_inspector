"""Structured logging for shell modules."""

from __future__ import annotations

import logging
import sys

_CONFIGURED = False


def configure_logging(level: int = logging.INFO) -> None:
    """Configure root logging once for CLI and server processes."""
    global _CONFIGURED
    if _CONFIGURED:
        return
    logging.basicConfig(
        level=level,
        format="%(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    _CONFIGURED = True


def set_verbose(enabled: bool) -> None:
    """Raise log verbosity for diagnostic CLI runs."""
    configure_logging()
    logging.getLogger().setLevel(logging.DEBUG if enabled else logging.INFO)


def get_logger(name: str) -> logging.Logger:
    """Return a module logger after ensuring logging is configured."""
    configure_logging()
    return logging.getLogger(name)
