"""DuckDB schema and version management."""

from __future__ import annotations

import duckdb

SCHEMA_VERSION = 2

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
        category VARCHAR NOT NULL,
        lines INTEGER NOT NULL,
        function_count INTEGER NOT NULL,
        jones_line_count INTEGER NOT NULL,
        top_folder VARCHAR NOT NULL DEFAULT '.',
        cc_count INTEGER NOT NULL,
        cc_mean DOUBLE NOT NULL,
        cc_median DOUBLE NOT NULL,
        cc_p95 DOUBLE NOT NULL,
        cc_max DOUBLE NOT NULL,
        cog_count INTEGER NOT NULL,
        cog_mean DOUBLE NOT NULL,
        cog_median DOUBLE NOT NULL,
        cog_p95 DOUBLE NOT NULL,
        cog_max DOUBLE NOT NULL,
        jones_count INTEGER NOT NULL,
        jones_mean DOUBLE NOT NULL,
        jones_median DOUBLE NOT NULL,
        jones_p95 DOUBLE NOT NULL,
        jones_max DOUBLE NOT NULL,
        parse_error VARCHAR,
        PRIMARY KEY (commit_hash, module_name, relative_path)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS module_aggregate (
        commit_hash VARCHAR NOT NULL,
        module_name VARCHAR NOT NULL,
        total_lines INTEGER NOT NULL,
        python_lines INTEGER NOT NULL,
        js_lines INTEGER NOT NULL,
        python_test_lines INTEGER NOT NULL,
        xml_lines INTEGER NOT NULL,
        css_lines INTEGER NOT NULL,
        html_lines INTEGER NOT NULL,
        python_file_count INTEGER NOT NULL DEFAULT 0,
        cc_count INTEGER NOT NULL,
        cc_mean DOUBLE NOT NULL,
        cc_median DOUBLE NOT NULL,
        cc_p95 DOUBLE NOT NULL,
        cc_max DOUBLE NOT NULL,
        cog_count INTEGER NOT NULL,
        cog_mean DOUBLE NOT NULL,
        cog_median DOUBLE NOT NULL,
        cog_p95 DOUBLE NOT NULL,
        cog_max DOUBLE NOT NULL,
        jones_count INTEGER NOT NULL,
        jones_mean DOUBLE NOT NULL,
        jones_median DOUBLE NOT NULL,
        jones_p95 DOUBLE NOT NULL,
        jones_max DOUBLE NOT NULL,
        declared_models_count INTEGER NOT NULL,
        inherited_models_count INTEGER NOT NULL,
        python_complexity_parse_errors INTEGER NOT NULL,
        score_out INTEGER NOT NULL,
        score_in INTEGER NOT NULL,
        PRIMARY KEY (commit_hash, module_name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS coupling_edge (
        commit_hash VARCHAR NOT NULL,
        source_module VARCHAR NOT NULL,
        target_module VARCHAR NOT NULL,
        score INTEGER NOT NULL,
        PRIMARY KEY (commit_hash, source_module, target_module)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS coupling_edge_kind (
        commit_hash VARCHAR NOT NULL,
        source_module VARCHAR NOT NULL,
        target_module VARCHAR NOT NULL,
        kind VARCHAR NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (commit_hash, source_module, target_module, kind)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS coupling_edge_breakdown (
        commit_hash VARCHAR NOT NULL,
        source_module VARCHAR NOT NULL,
        target_module VARCHAR NOT NULL,
        model_reuse INTEGER NOT NULL,
        extension_or_method INTEGER NOT NULL,
        view INTEGER NOT NULL,
        field_property INTEGER NOT NULL,
        total INTEGER NOT NULL,
        PRIMARY KEY (commit_hash, source_module, target_module)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS coupling_edge_evidence (
        commit_hash VARCHAR NOT NULL,
        source_module VARCHAR NOT NULL,
        target_module VARCHAR NOT NULL,
        kind VARCHAR NOT NULL,
        file_path VARCHAR NOT NULL,
        line INTEGER NOT NULL,
        detail VARCHAR NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS module_model (
        commit_hash VARCHAR NOT NULL,
        module_name VARCHAR NOT NULL,
        model_name VARCHAR NOT NULL,
        relation VARCHAR NOT NULL,
        PRIMARY KEY (commit_hash, module_name, model_name, relation)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS module_manifest_depend (
        commit_hash VARCHAR NOT NULL,
        module_name VARCHAR NOT NULL,
        depends_on VARCHAR NOT NULL,
        PRIMARY KEY (commit_hash, module_name, depends_on)
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


def initialize_schema(connection: duckdb.DuckDBPyConnection, tool_version: str) -> None:
    """Create tables and seed meta row when missing."""
    for statement in DDL_STATEMENTS:
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
