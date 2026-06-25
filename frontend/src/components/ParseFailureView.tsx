import { Table, Text } from "@mantine/core";

import type { FailureRow } from "../api/client";
import { formatParseFailure, parseFailureFromRow, type ParseFailure } from "../domain/domain";

type Props = {
  readonly failures: readonly FailureRow[];
};

export function ParseFailureView({ failures }: Props) {
  if (!failures.length) {
    return <Text c="dimmed">No parse failures at this commit.</Text>;
  }
  const rows: readonly ParseFailure[] = failures.map(parseFailureFromRow);
  return (
    <Table striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>File</Table.Th>
          <Table.Th>Error</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((failure, index) => (
          <Table.Tr key={`${failure.path}-${index}`}>
            <Table.Td>{failure.path}</Table.Td>
            <Table.Td>{formatParseFailure(failure)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
