"""Contract tests for DuckDB schema."""

from pathlib import Path

import duckdb

from ppi.storage.schema import DDL_STATEMENTS, SCHEMA_VERSION, initialize_schema


def test_schema_tables_exist(tmp_path: Path):
    """DDL creates expected tables and schema version."""
    store = tmp_path / "test.duckdb"
    connection = duckdb.connect(str(store))
    initialize_schema(connection, "0.1.0")
    tables = {
        row[0]
        for row in connection.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
        ).fetchall()
    }
    connection.close()
    assert "commit" in tables
    assert "file_metric" in tables
    assert "module_aggregate" in tables
    assert "coupling_edge" in tables
    assert "coupling_edge_breakdown" in tables
    assert "coupling_edge_evidence" in tables
    assert "module_model" in tables
    assert "module_manifest_depend" in tables
    assert SCHEMA_VERSION == 2
    assert len(DDL_STATEMENTS) >= 12
