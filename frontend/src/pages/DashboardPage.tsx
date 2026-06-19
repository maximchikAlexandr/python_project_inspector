import {
  Alert,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import {
  fetchCatalog,
  fetchHotspots,
  fetchTimeseries,
  type HotspotItem,
  type TimeseriesPoint,
} from "../api/client";
import { HotspotsTable } from "../components/HotspotsTable";
import { MetricChart } from "../components/MetricChart";

const METRICS = [
  { value: "cyclomatic", label: "Cyclomatic" },
  { value: "cognitive", label: "Cognitive" },
  { value: "jones", label: "Jones" },
];

const AGGS = [
  { value: "mean", label: "Mean" },
  { value: "median", label: "Median" },
  { value: "p95", label: "P95" },
  { value: "max", label: "Max" },
];

export function DashboardPage() {
  const [level, setLevel] = useState<"module" | "file">("module");
  const [metric, setMetric] = useState("cyclomatic");
  const [agg, setAgg] = useState("mean");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [complexityPoints, setComplexityPoints] = useState<TimeseriesPoint[]>([]);
  const [sizePoints, setSizePoints] = useState<TimeseriesPoint[]>([]);
  const [valueHotspots, setValueHotspots] = useState<HotspotItem[]>([]);
  const [growthHotspots, setGrowthHotspots] = useState<HotspotItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const nameOptions = useMemo(
    () => names.map((name) => ({ value: name, label: name })),
    [names],
  );

  useEffect(() => {
    fetchCatalog(level)
      .then((payload) => setNames(payload.names))
      .catch((err: Error) => setError(err.message));
  }, [level]);

  useEffect(() => {
    if (!names.length) {
      setSelectedName(null);
      return;
    }
    if (!selectedName || !names.includes(selectedName)) {
      setSelectedName(names[0]);
    }
  }, [names, selectedName]);

  useEffect(() => {
    setError(null);
    Promise.all([
      fetchHotspots({ level, metric, by: "value", limit: 20 }),
      fetchHotspots({ level, metric, by: "growth", limit: 20 }),
    ])
      .then(([byValue, byGrowth]) => {
        setValueHotspots(byValue.items);
        setGrowthHotspots(byGrowth.items);
      })
      .catch((err: Error) => setError(err.message));
  }, [level, metric]);

  useEffect(() => {
    if (!selectedName || !names.includes(selectedName)) {
      return;
    }
    setError(null);
    Promise.all([
      fetchTimeseries({ level, metric, name: selectedName, agg }),
      fetchTimeseries({ level, metric: "lines", name: selectedName }),
    ])
      .then(([complexity, size]) => {
        setComplexityPoints(complexity.series[0]?.points ?? []);
        setSizePoints(size.series[0]?.points ?? []);
      })
      .catch((err: Error) => setError(err.message));
  }, [agg, level, metric, names, selectedName]);

  return (
    <Stack gap="lg">
      <Title order={3}>Metrics dashboard</Title>
      {error ? <Alert color="red">{error}</Alert> : null}
      <Group align="flex-end" wrap="wrap">
        <Select
          label="Level"
          data={[
            { value: "module", label: "Module" },
            { value: "file", label: "File" },
          ]}
          value={level}
          onChange={(value) => setLevel((value as "module" | "file") ?? "module")}
          w={140}
        />
        <Select
          label="Target"
          data={nameOptions}
          value={selectedName}
          onChange={setSelectedName}
          searchable
          nothingFoundMessage="No targets"
          w={320}
        />
        <Select
          label="Complexity metric"
          data={METRICS}
          value={metric}
          onChange={(value) => setMetric(value ?? "cyclomatic")}
          w={180}
        />
        <Select
          label="Aggregation"
          data={AGGS}
          value={agg}
          onChange={(value) => setAgg(value ?? "mean")}
          w={140}
        />
      </Group>

      <Tabs defaultValue="complexity">
        <Tabs.List>
          <Tabs.Tab value="complexity">Complexity over time</Tabs.Tab>
          <Tabs.Tab value="size">Line count history</Tabs.Tab>
          <Tabs.Tab value="hotspots">Hotspots</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="complexity" pt="md">
          <MetricChart
            title={`${metric} (${agg}) — ${selectedName ?? ""}`}
            points={complexityPoints}
            yLabel={metric}
          />
        </Tabs.Panel>

        <Tabs.Panel value="size" pt="md">
          <MetricChart
            title={`Lines — ${selectedName ?? ""}`}
            points={sizePoints}
            yLabel="lines"
          />
        </Tabs.Panel>

        <Tabs.Panel value="hotspots" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <HotspotsTable
              title={`Top by current ${metric}`}
              items={valueHotspots}
              showGrowth={false}
            />
            <HotspotsTable
              title={`Top by ${metric} growth`}
              items={growthHotspots}
              showGrowth
            />
          </SimpleGrid>
        </Tabs.Panel>
      </Tabs>

      {!selectedName ? (
        <Text c="dimmed">Run analysis and pick a target to load charts.</Text>
      ) : null}
    </Stack>
  );
}
