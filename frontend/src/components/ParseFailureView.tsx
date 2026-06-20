import { Table, Text } from "@mantine/core";

import type { FailureRow } from "../api/client";

type Props = {
  failures: FailureRow[];
};

export function ParseFailureView({ failures }: Props) {
  if (!failures.length) {
    return <Text c="dimmed">No parse failures at this commit.</Text>;
  }
  return (
    <Table striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>File</Table.Th>
          <Table.Th>Error</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {failures.map((row, index) => (
          <Table.Tr key={`${row.file_path}-${index}`}>
            <Table.Td>{row.file_path ?? "—"}</Table.Td>
            <Table.Td>{row.error_text}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
