"""Shared name parsing helpers."""


def parse_module_file_path(name: str) -> tuple[str, str]:
    """Split a module/file path into module name and relative path."""
    module_name, _, relative_path = name.partition("/")
    if not module_name or not relative_path:
        raise ValueError("file name must be module/relative/path")
    return module_name, relative_path
