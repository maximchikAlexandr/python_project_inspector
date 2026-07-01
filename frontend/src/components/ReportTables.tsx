import { Button, Stack, Table, Text } from "@mantine/core";
import { useMemo, useState } from "react";

import type { GenericTableResponse, GenericTableRow, RelationRow } from "../api/client";
import type { UiColumnDefinition } from "../api/client";

function cellValue(row: GenericTableRow, key: string): unknown {
  return row.cells[key];
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, number>;
    const median = obj.median ?? obj.mean;
    return median !== undefined ? String(median) : JSON.stringify(value);
  }
  return String(value);
}

type SnapshotEntityTableProps = {
  readonly rows: readonly GenericTableRow[];
  readonly columns: readonly UiColumnDefinition[];
  readonly filesTable: GenericTableResponse | null;
  readonly fileColumns: readonly UiColumnDefinition[];
};

export function SnapshotEntityTable({ rows, columns, filesTable, fileColumns }: SnapshotEntityTableProps) {
  const [drillModule, setDrillModule] = useState<string | null>(null);

  const fileRows = useMemo(() => {
    if (!filesTable || !drillModule) return [];
    return filesTable.rows.filter((r) => r.cells.module_name === drillModule);
  }, [filesTable, drillModule]);

  if (drillModule) {
    return (
      <Stack gap="sm">
        <Button variant="subtle" size="xs" onClick={() => setDrillModule(null)}>
          ← Back to modules
        </Button>
        <Text size="sm" fw={600}>Files in {drillModule}</Text>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              {fileColumns.map((col) => (
                <Table.Th key={col.key}>{col.label}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {fileRows.map((row, index) => (
              <Table.Tr key={`${row.cells.relative_path ?? index}`}>
                {fileColumns.map((col) => (
                  <Table.Td key={col.key}>{formatCell(cellValue(row, col.key))}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    );
  }

  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          {columns.map((col) => (
            <Table.Th key={col.key}>{col.label}</Table.Th>
          ))}
          <Table.Th>Files</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row, index) => {
          const name = row.cells.module_name ?? String(index);
          return (
            <Table.Tr key={String(name)}>
              {columns.map((col) => (
                <Table.Td key={col.key}>{formatCell(cellValue(row, col.key))}</Table.Td>
              ))}
              <Table.Td>
                <Button variant="subtle" size="xs" onClick={() => setDrillModule(String(name))}>
                  Files
                </Button>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

type RelationsTableProps = {
  readonly relations: readonly RelationRow[];
  readonly columns: readonly UiColumnDefinition[];
};

export function RelationsTable({ relations, columns }: RelationsTableProps) {
  if (!relations.length) {
    return <Text c="dimmed">No relations at this commit.</Text>;
  }
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          {columns.map((col) => (
            <Table.Th key={col.key}>{col.label}</Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {relations.map((row, index) => (
          <Table.Tr key={`${row.source_id}-${row.target_id}-${row.relation_type_id}-${index}`}>
            {columns.map((col) => {
              const key = col.key as keyof RelationRow;
              return <Table.Td key={col.key}>{formatCell(row[key] ?? "—")}</Table.Td>;
            })}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}