import { Table, Text } from "@mantine/core";

import type { ModuleSnapshot } from "../api/client";

type Props = {
  modules: ModuleSnapshot[];
};

export function ManifestDependsView({ modules }: Props) {
  const rows = modules.flatMap((module) =>
    (module.manifest_depends ?? []).map((dependsOn) => ({
      module: module.module_name,
      dependsOn,
    })),
  );
  if (!rows.length) {
    return <Text c="dimmed">No in-scope manifest dependencies at this commit.</Text>;
  }
  return (
    <Table striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Module</Table.Th>
          <Table.Th>Depends on</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={`${row.module}-${row.dependsOn}`}>
            <Table.Td>{row.module}</Table.Td>
            <Table.Td>{row.dependsOn}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
