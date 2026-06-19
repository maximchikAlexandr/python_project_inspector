import { LineChart } from "@mantine/charts";
import { Group, Paper, Select, Stack, Table, Text, Title } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import {
  fetchCommits,
  fetchEdges,
  fetchStructureTimeseries,
  type CommitRow,
  type EdgeRow,
  type StructurePoint,
} from "../api/client";

export function StructurePage() {
  const [commits, setCommits] = useState<CommitRow[]>([]);
  const [structurePoints, setStructurePoints] = useState<StructurePoint[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const commitOptions = useMemo(
    () =>
      commits.map((row) => ({
        value: row.commit_hash,
        label: `#${row.commit_order} ${row.commit_hash.slice(0, 8)} ${row.summary ?? ""}`,
      })),
    [commits],
  );

  useEffect(() => {
    Promise.all([fetchCommits(), fetchStructureTimeseries()])
      .then(([commitRows, structure]) => {
        setCommits(commitRows);
        setStructurePoints(structure.points);
        const defaultCommit =
          [...structure.points].reverse().find((point) => point.edge_count > 0)?.commit_hash
          ?? commitRows[commitRows.length - 1]?.commit_hash
          ?? null;
        setSelectedCommit(defaultCommit);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedCommit) {
      return;
    }
    fetchEdges(selectedCommit, 1)
      .then((payload) => setEdges(payload.edges))
      .catch((err: Error) => setError(err.message));
  }, [selectedCommit]);

  const chartData = structurePoints.map((point) => ({
    order: point.commit_order,
    edge_count: point.edge_count,
    total_score: point.total_score,
    hash: point.commit_hash.slice(0, 8),
  }));

  return (
    <Stack gap="md">
      <Title order={3}>Structure over time</Title>
      {error ? <Text c="red">{error}</Text> : null}
      <Paper withBorder p="md">
        <Title order={4} mb="md">
          Coupling edges per commit
        </Title>
        {!chartData.length ? (
          <Text c="dimmed">No structure history stored yet.</Text>
        ) : (
          <LineChart
            h={280}
            data={chartData}
            dataKey="order"
            series={[
              { name: "edge_count", label: "Edges", color: "teal.6" },
              { name: "total_score", label: "Total score", color: "grape.6" },
            ]}
            curveType="monotone"
            withLegend
            withTooltip
          />
        )}
      </Paper>
      <Group align="flex-end">
        <Select
          label="Commit"
          data={commitOptions}
          value={selectedCommit}
          onChange={setSelectedCommit}
          searchable
          w={420}
        />
      </Group>
      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Coupling edges at selected commit
        </Title>
        {!edges.length ? (
          <Text c="dimmed">No coupling edges for this commit.</Text>
        ) : (
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Source</Table.Th>
                <Table.Th>Target</Table.Th>
                <Table.Th>Score</Table.Th>
                <Table.Th>Kinds</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {edges.map((edge) => (
                <Table.Tr key={`${edge.source}-${edge.target}`}>
                  <Table.Td>{edge.source}</Table.Td>
                  <Table.Td>{edge.target}</Table.Td>
                  <Table.Td>{edge.score}</Table.Td>
                  <Table.Td>
                    {Object.entries(edge.kinds)
                      .map(([kind, count]) => `${kind} (${count})`)
                      .join(", ") || "—"}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
