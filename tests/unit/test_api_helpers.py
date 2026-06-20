"""Unit tests for shared name parsing helpers."""

import pytest

from ppi.runtime.names import parse_module_file_path


def test_parse_module_file_path_splits_module_and_path():
    """File series names use module/relative/path format."""
    module_name, relative_path = parse_module_file_path("sale/models/sale.py")
    assert module_name == "sale"
    assert relative_path == "models/sale.py"


def test_parse_module_file_path_rejects_invalid():
    """Invalid file names raise ValueError."""
    with pytest.raises(ValueError):
        parse_module_file_path("module_only")
