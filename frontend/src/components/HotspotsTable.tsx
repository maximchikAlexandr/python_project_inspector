import { Paper, Table, Text, Title } from "@mantine/core";

import type { HotspotItem } from "../api/client";

type HotspotsTableProps = {
  readonly title: string;
  readonly items: readonly HotspotItem[];
  readonly showGrowth: boolean;
};

export function HotspotsTable({ title, items, showGrowth }: HotspotsTableProps) {
  return (
    <Paper withBorder p="md">
      <Title order={4} mb="md">
        {title}
      </Title>
      {!items.length ? (
        <Text c="dimmed">No hotspot data yet.</Text>
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Current</Table.Th>
              {showGrowth ? <Table.Th>Growth</Table.Th> : null}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item) => (
              <Table.Tr key={item.name}>
                <Table.Td>{item.name}</Table.Td>
                <Table.Td>{item.current?.toFixed(2) ?? "—"}</Table.Td>
                {showGrowth ? (
                  <Table.Td>{item.growth != null ? item.growth.toFixed(2) : "—"}</Table.Td>
                ) : null}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}
