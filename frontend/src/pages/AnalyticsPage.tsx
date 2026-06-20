import { LineChart } from "@mantine/charts";
import { Group, Paper, Select, Stack, Table, Text, Title } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchCatalog,
  fetchCommits,
  fetchEdgeKindTimeseries,
  fetchRelationsDiff,
  fetchTimeseries,
  type CommitRow,
  type EdgeKindPoint,
  type RelationsDiffChange,
} from "../api/client";
import { LINE_CATEGORIES } from "../registry/odooProfile";

const CATEGORY_COLORS = ["blue.6", "orange.6", "teal.6", "grape.6", "cyan.6", "pink.6"];

export function AnalyticsPage() {
  const [commits, setCommits] = useState<CommitRow[]>([]);
  const [moduleNames, setModuleNames] = useState<string[]>([]);
  const [moduleName, setModuleName] = useState<string | null>(null);
  const [commitA, setCommitA] = useState<string | null>(null);
  const [commitB, setCommitB] = useState<string | null>(null);
  const [categoryChart, setCategoryChart] = useState<Record<string, number | string>[]>([]);
  const [categorySeries, setCategorySeries] = useState<{ name: string; label: string; color: string }[]>([]);
  const [fileCountSeries, setFileCountSeries] = useState<{ order: number; value: number }[]>([]);
  const [edgeKindPoints, setEdgeKindPoints] = useState<EdgeKindPoint[]>([]);
  const [diffChanges, setDiffChanges] = useState<RelationsDiffChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bootstrapGeneration = useRef(0);
  const moduleGeneration = useRef(0);
  const diffGeneration = useRef(0);

  const commitOptions = useMemo(
    () =>
      commits.map((row) => ({
        value: row.commit_hash,
        label: `#${row.commit_order} ${row.commit_hash.slice(0, 8)}`,
      })),
    [commits],
  );

  const moduleOptions = useMemo(
    () => moduleNames.map((name) => ({ value: name, label: name })),
    [moduleNames],
  );

  const edgeKindChart = useMemo(() => {
    const orders = [...new Set(edgeKindPoints.map((point) => point.commit_order))].sort((a, b) => a - b);
    const kinds = [...new Set(edgeKindPoints.map((point) => point.kind))].sort();
    return orders.map((order) => {
      const row: Record<string, number | string> = { order };
      for (const kind of kinds) {
        row[kind] = edgeKindPoints.find((point) => point.commit_order === order && point.kind === kind)?.value ?? 0;
      }
      return row;
    });
  }, [edgeKindPoints]);

  const edgeKindSeries = useMemo(
    () =>
      [...new Set(edgeKindPoints.map((point) => point.kind))].sort().map((kind, index) => ({
        name: kind,
        label: kind,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      })),
    [edgeKindPoints],
  );

  useEffect(() => {
    const generation = bootstrapGeneration.current + 1;
    bootstrapGeneration.current = generation;
    Promise.all([fetchCommits(), fetchCatalog("module")])
      .then(([rows, catalog]) => {
        if (generation !== bootstrapGeneration.current) {
          return;
        }
        setCommits(rows);
        setModuleNames(catalog.names);
        setModuleName(catalog.names[0] ?? null);
        setCommitA(rows[0]?.commit_hash ?? null);
        setCommitB(rows[rows.length - 1]?.commit_hash ?? null);
      })
      .catch((err: Error) => {
        if (generation === bootstrapGeneration.current) {
          setError(err.message);
        }
      });
  }, []);

  useEffect(() => {
    if (!moduleName) {
      return;
    }
    const generation = moduleGeneration.current + 1;
    moduleGeneration.current = generation;
    setCategoryChart([]);
    setFileCountSeries([]);
    Promise.all([
      fetchTimeseries({ level: "module", metric: "lines_by_category", name: moduleName }),
      fetchTimeseries({ level: "module", metric: "python_file_count", name: moduleName }),
      fetchEdgeKindTimeseries(),
    ])
      .then(([categories, fileCount, edgeKinds]) => {
        if (generation !== moduleGeneration.current) {
          return;
        }
        const orders = [
          ...new Set(categories.series.flatMap((series) => series.points.map((point) => point.commit_order))),
        ].sort((a, b) => a - b);
        const chartRows = orders.map((order) => {
          const row: Record<string, number | string> = { order };
          categories.series.forEach((series) => {
            const category = series.name.split("/").pop() ?? series.name;
            row[category] = Number(series.points.find((point) => point.commit_order === order)?.value ?? 0);
          });
          return row;
        });
        setCategoryChart(chartRows);
        setCategorySeries(
          LINE_CATEGORIES.map(({ key, label }, index) => ({
            name: key,
            label,
            color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
          })),
        );
        setFileCountSeries(
          fileCount.series[0]?.points.map((point) => ({
            order: point.commit_order,
            value: Number(point.value ?? 0),
          })) ?? [],
        );
        setEdgeKindPoints(edgeKinds.points);
      })
      .catch((err: Error) => {
        if (generation === moduleGeneration.current) {
          setError(err.message);
        }
      });
  }, [moduleName]);

  useEffect(() => {
    if (!commitA || !commitB) {
      return;
    }
    const generation = diffGeneration.current + 1;
    diffGeneration.current = generation;
    fetchRelationsDiff(commitA, commitB)
      .then((payload) => {
        if (generation === diffGeneration.current) {
          setDiffChanges(payload.changes);
        }
      })
      .catch((err: Error) => {
        if (generation === diffGeneration.current) {
          setError(err.message);
        }
      });
  }, [commitA, commitB]);

  return (
    <Stack gap="md">
      <Title order={3}>History analytics</Title>
      {error ? <Text c="red">{error}</Text> : null}
      <Group align="flex-end">
        <Select
          label="Module for series"
          data={moduleOptions}
          value={moduleName}
          onChange={setModuleName}
          searchable
          w={320}
        />
        <Select label="Commit A" data={commitOptions} value={commitA} onChange={setCommitA} searchable w={240} />
        <Select label="Commit B" data={commitOptions} value={commitB} onChange={setCommitB} searchable w={240} />
      </Group>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Lines by category ({moduleName})
        </Title>
        <LineChart h={240} data={categoryChart} dataKey="order" series={categorySeries} withLegend withTooltip />
      </Paper>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Python file count
        </Title>
        <LineChart
          h={220}
          data={fileCountSeries}
          dataKey="order"
          series={[{ name: "value", label: "files", color: "teal.6" }]}
        />
      </Paper>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Edge kind timeseries
        </Title>
        {edgeKindSeries.length ? (
          <LineChart h={240} data={edgeKindChart} dataKey="order" series={edgeKindSeries} withLegend withTooltip />
        ) : (
          <Text c="dimmed">No edge-kind history stored yet.</Text>
        )}
      </Paper>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Relations diff
        </Title>
        {!diffChanges.length ? (
          <Text c="dimmed">No relation changes between selected commits.</Text>
        ) : (
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Change</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th>Target</Table.Th>
                <Table.Th>Score A</Table.Th>
                <Table.Th>Score B</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {diffChanges.map((change) => (
                <Table.Tr key={`${change.change}-${change.source}-${change.target}`}>
                  <Table.Td>{change.change}</Table.Td>
                  <Table.Td>{change.source}</Table.Td>
                  <Table.Td>{change.target}</Table.Td>
                  <Table.Td>{change.score_a ?? "—"}</Table.Td>
                  <Table.Td>{change.score_b ?? "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
