#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "radon==6.0.1",
#   "complexipy==5.6.1",
#   "click==8.1.7",
#   "toolz==0.12.1",
# ]
# ///

"""CLI entrypoint for the coupling report generator."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

TARGET = Path(__file__).resolve().parent / "report.py"


def load_main():
    """Load the Click command from the adjacent implementation module."""
    spec = importlib.util.spec_from_file_location("python_project_inspector_report", TARGET)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load report builder from {TARGET}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.main

if __name__ == "__main__":
    raise SystemExit(load_main()(prog_name=Path(__file__).name))
