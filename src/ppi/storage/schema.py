"""DuckDB schema and version management."""

from __future__ import annotations

from pathlib import Path

import duckdb

SCHEMA_VERSION = 3

DDL_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS meta (
        schema_version INTEGER NOT NULL,
        tool_version VARCHAR NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS project (
        project_id VARCHAR PRIMARY KEY,
        repo_path VARCHAR NOT NULL,
        branch VARCHAR NOT NULL,
        profile VARCHAR NOT NULL,
        project_label VARCHAR NOT NULL DEFAULT '',
        module_prefixes VARCHAR NOT NULL DEFAULT '',
        include_modules VARCHAR NOT NULL DEFAULT '',
        all_modules BOOLEAN NOT NULL DEFAULT TRUE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS analysis_run (
        run_id VARCHAR PRIMARY KEY,
        branch VARCHAR NOT NULL,
        mode VARCHAR NOT NULL,
        status VARCHAR NOT NULL,
        started_at TIMESTAMP NOT NULL,
        finished_at TIMESTAMP,
        commits_total INTEGER NOT NULL,
        commits_succeeded INTEGER NOT NULL,
        commits_failed INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS commit (
        commit_hash VARCHAR PRIMARY KEY,
        commit_order INTEGER NOT NULL,
        author_name VARCHAR NOT NULL,
        author_email VARCHAR NOT NULL,
        authored_at TIMESTAMP NOT NULL,
        committed_at TIMESTAMP NOT NULL,
        summary VARCHAR NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS file_metric (
        commit_hash VARCHAR NOT NULL,
        module_name VARCHAR NOT NULL,
        relative_path VARCHAR NOT NULL,
        line_category_id VARCHAR NOT NULL,
        metrics JSON NOT NULL,
        line_counts JSON NOT NULL,
        distributions JSON NOT NULL,
        PRIMARY KEY (commit_hash, module_name, relative_path)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS module_aggregate (
        commit_hash VARCHAR NOT NULL,
        module_name VARCHAR NOT NULL,
        total_lines INTEGER NOT NULL,
        metrics JSON NOT NULL,
        line_counts JSON NOT NULL,
        distributions JSON NOT NULL,
        PRIMARY KEY (commit_hash, module_name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS coupling_edge (
        commit_hash VARCHAR NOT NULL,
        source_module VARCHAR NOT NULL,
        target_module VARCHAR NOT NULL,
        score INTEGER NOT NULL,
        kinds JSON NOT NULL,
        kind_occurrence_count INTEGER NOT NULL DEFAULT 0,
        breakdown JSON,
        PRIMARY KEY (commit_hash, source_module, target_module)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS failure (
        run_id VARCHAR NOT NULL,
        commit_hash VARCHAR,
        file_path VARCHAR,
        error_text VARCHAR NOT NULL
    )
    """,
)

MIGRATION_STATEMENTS: tuple[str, ...] = ()


def initialize_schema(connection: duckdb.DuckDBPyConnection, tool_version: str) -> None:
    """Create tables and seed meta row when missing."""
    for statement in DDL_STATEMENTS:
        connection.execute(statement)
    for statement in MIGRATION_STATEMENTS:
        connection.execute(statement)
    row = connection.execute("SELECT COUNT(*) FROM meta").fetchone()
    if row and row[0] == 0:
        connection.execute(
            "INSERT INTO meta (schema_version, tool_version) VALUES (?, ?)",
            [SCHEMA_VERSION, tool_version],
        )


def read_schema_version(connection: duckdb.DuckDBPyConnection) -> int | None:
    """Return stored schema version or None when meta is empty."""
    try:
        row = connection.execute(
            "SELECT schema_version FROM meta ORDER BY created_at DESC LIMIT 1",
        ).fetchone()
    except duckdb.CatalogException:
        return None
    return int(row[0]) if row else None


class SchemaIncompatibleError(ValueError):
    """Raised when an on-disk store schema does not match this package."""

    def __init__(self, *, stored: int, expected: int) -> None:
        """Initialize with stored and expected schema versions."""
        self.stored = stored
        self.expected = expected
        super().__init__(
            f"Incompatible store schema version {stored}; this package expects {expected}. "
            "Re-run analyze with --rebuild.",
        )


def assert_schema_compatible(connection: duckdb.DuckDBPyConnection) -> None:
    """Raise when the store schema version does not match this package."""
    version = read_schema_version(connection)
    if version is None:
        return
    if version != SCHEMA_VERSION:
        raise SchemaIncompatibleError(stored=version, expected=SCHEMA_VERSION)
