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
    assert "coupling_edge_breakdown" not in tables
    assert "coupling_edge_evidence" not in tables
    assert "module_model" not in tables
    assert "module_manifest_depend" not in tables
    assert SCHEMA_VERSION == 3
    assert len(DDL_STATEMENTS) >= 8


def test_schema_json_columns_exist(tmp_path: Path):
    """v3 stores metrics, line_counts, breakdown, kinds as JSON columns."""
    store = tmp_path / "test.duckdb"
    connection = duckdb.connect(str(store))
    initialize_schema(connection, "0.1.0")
    module_cols = {
        row[0]
        for row in connection.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'module_aggregate'",
        ).fetchall()
    }
    assert "metrics" in module_cols
    assert "line_counts" in module_cols
    edge_cols = {
        row[0]
        for row in connection.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'coupling_edge'",
        ).fetchall()
    }
    assert "kinds" in edge_cols
    assert "breakdown" in edge_cols
    file_cols = {
        row[0]
        for row in connection.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'file_metric'",
        ).fetchall()
    }
    assert "metrics" in file_cols
    assert "line_counts" in file_cols
    connection.close()
