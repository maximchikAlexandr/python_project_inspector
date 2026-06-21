import { LineChart } from "@mantine/charts";
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
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchCatalog,
  fetchHotspots,
  fetchTimeseries,
  type HotspotItem,
  type TimeseriesPoint,
} from "../api/client";
import { HotspotsTable } from "../components/HotspotsTable";
import { MetricChart } from "../components/MetricChart";
import { t } from "../i18n";
import {
  categoryChartFromTimeseries,
  normalizeDashboardSelection,
  type DashboardLevel,
  type DashboardTab,
} from "../transforms/dashboardTransforms";

const COMPLEXITY_METRICS = [
  { value: "cyclomatic", label: t("metrics.cyclomatic", "Cyclomatic") },
  { value: "cognitive", label: t("metrics.cognitive", "Cognitive") },
  { value: "jones", label: t("metrics.jones", "Jones") },
];

const MODULE_METRICS = [
  ...COMPLEXITY_METRICS,
  { value: "python_file_count", label: t("metrics.pythonFileCount", "Python file count") },
];

const AGGS = [
  { value: "mean", label: t("aggregation.mean", "Mean") },
  { value: "median", label: t("aggregation.median", "Median") },
  { value: "p95", label: t("aggregation.p95", "P95") },
  { value: "max", label: t("aggregation.max", "Max") },
];

export function DashboardPage() {
  const [level, setLevel] = useState<DashboardLevel>("module");
  const [metric, setMetric] = useState("cyclomatic");
  const [agg, setAgg] = useState("mean");
  const [activeTab, setActiveTab] = useState<DashboardTab>("complexity");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [complexityPoints, setComplexityPoints] = useState<TimeseriesPoint[]>([]);
  const [sizePoints, setSizePoints] = useState<TimeseriesPoint[]>([]);
  const [categoryChart, setCategoryChart] = useState<Record<string, number | string>[]>([]);
  const [categorySeries, setCategorySeries] = useState<{ name: string; label: string; color: string }[]>([]);
  const [valueHotspots, setValueHotspots] = useState<HotspotItem[]>([]);
  const [growthHotspots, setGrowthHotspots] = useState<HotspotItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const hotspotsGeneration = useRef(0);
  const seriesGeneration = useRef(0);

  const metricOptions = level === "module" ? MODULE_METRICS : COMPLEXITY_METRICS;
  const hotspotAgg = metric === "python_file_count" ? "mean" : agg;

  const nameOptions = useMemo(() => names.map((name) => ({ value: name, label: name })), [names]);

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
    const normalized = normalizeDashboardSelection({ level, metric, activeTab });
    if (normalized.metric !== metric) {
      setMetric(normalized.metric);
    }
    if (normalized.activeTab !== activeTab) {
      setActiveTab(normalized.activeTab);
    }
  }, [activeTab, level, metric]);

  function onLevelChange(value: string | null) {
    const nextLevel = (value as DashboardLevel | null) ?? "module";
    const normalized = normalizeDashboardSelection({ level: nextLevel, metric, activeTab });
    setLevel(nextLevel);
    setMetric(normalized.metric);
    setActiveTab(normalized.activeTab);
  }

  useEffect(() => {
    if (level === "file" && metric === "python_file_count") {
      return;
    }
    const generation = hotspotsGeneration.current + 1;
    hotspotsGeneration.current = generation;
    setError(null);
    Promise.all([
      fetchHotspots({ level, metric, by: "value", limit: 20, agg: hotspotAgg }),
      fetchHotspots({ level, metric, by: "growth", limit: 20, agg: hotspotAgg }),
    ])
      .then(([byValue, byGrowth]) => {
        if (generation !== hotspotsGeneration.current) {
          return;
        }
        setValueHotspots(byValue.items);
        setGrowthHotspots(byGrowth.items);
      })
      .catch((err: Error) => {
        if (generation === hotspotsGeneration.current) {
          setError(err.message);
        }
      });
  }, [hotspotAgg, level, metric]);

  useEffect(() => {
    if (level === "file" && metric === "python_file_count") {
      return;
    }
    if (!selectedName || !names.includes(selectedName)) {
      return;
    }
    const generation = seriesGeneration.current + 1;
    seriesGeneration.current = generation;
    setError(null);
    const requests = [
      fetchTimeseries({
        level,
        metric,
        name: selectedName,
        agg: metric === "python_file_count" ? undefined : agg,
      }),
      fetchTimeseries({ level, metric: "lines", name: selectedName }),
    ];
    if (level === "module") {
      requests.push(fetchTimeseries({ level: "module", metric: "lines_by_category", name: selectedName }));
    }
    Promise.all(requests)
      .then(([complexity, size, categories]) => {
        if (generation !== seriesGeneration.current) {
          return;
        }
        setComplexityPoints(complexity.series[0]?.points ?? []);
        setSizePoints(size.series[0]?.points ?? []);
        if (categories) {
          const shaped = categoryChartFromTimeseries(categories);
          setCategoryChart(shaped.chartRows);
          setCategorySeries(shaped.series);
        } else {
          setCategoryChart([]);
          setCategorySeries([]);
        }
      })
      .catch((err: Error) => {
        if (generation === seriesGeneration.current) {
          setError(err.message);
        }
      });
  }, [agg, level, metric, names, selectedName]);

  return (
    <Stack gap="lg">
      <Title order={3}>{t("dashboard.title", "Metrics dashboard")}</Title>
      {error ? <Alert color="red">{error}</Alert> : null}
      <Group align="flex-end" wrap="wrap">
        <Select
          label={t("dashboard.level", "Level")}
          data={[
            { value: "module", label: t("common.module", "Module") },
            { value: "file", label: t("common.file", "File") },
          ]}
          value={level}
          onChange={onLevelChange}
          w={140}
        />
        <Select
          label={t("dashboard.target", "Target")}
          data={nameOptions}
          value={selectedName}
          onChange={setSelectedName}
          searchable
          nothingFoundMessage={t("dashboard.noTargets", "No targets")}
          w={320}
        />
        <Select
          label={t("dashboard.metric", "Metric")}
          data={metricOptions}
          value={metric}
          onChange={(value) => setMetric(value ?? "cyclomatic")}
          w={180}
        />
        {metric !== "python_file_count" ? (
          <Select
            label={t("dashboard.aggregation", "Aggregation")}
            data={AGGS}
            value={agg}
            onChange={(value) => setAgg(value ?? "mean")}
            w={140}
          />
        ) : null}
      </Group>

      <Tabs value={activeTab} onChange={(value) => setActiveTab((value as DashboardTab | null) ?? "complexity")}>
        <Tabs.List>
          <Tabs.Tab value="complexity">{t("dashboard.tabs.complexity", "Complexity over time")}</Tabs.Tab>
          <Tabs.Tab value="size">{t("dashboard.tabs.size", "Line count history")}</Tabs.Tab>
          {level === "module" ? <Tabs.Tab value="categories">{t("dashboard.tabs.categories", "Line categories")}</Tabs.Tab> : null}
          <Tabs.Tab value="hotspots">{t("dashboard.tabs.hotspots", "Hotspots")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="complexity" pt="md">
          <MetricChart
            title={t("dashboard.chart.complexityTitle", "{{metric}}{{agg}} - {{name}}", {
              metric,
              agg: metric === "python_file_count" ? "" : ` (${agg})`,
              name: selectedName ?? "",
            })}
            points={complexityPoints}
            yLabel={metric}
          />
        </Tabs.Panel>

        <Tabs.Panel value="size" pt="md">
          <MetricChart
            title={t("dashboard.chart.totalLinesTitle", "Total lines - {{name}}", { name: selectedName ?? "" })}
            points={sizePoints}
            yLabel={t("metrics.lines", "lines")}
          />
        </Tabs.Panel>

        {level === "module" ? (
          <Tabs.Panel value="categories" pt="md">
            {categoryChart.length ? (
              <LineChart h={280} data={categoryChart} dataKey="order" series={categorySeries} withLegend withTooltip />
            ) : (
              <Text c="dimmed">{t("dashboard.empty.categories", "Select a module to load line category history.")}</Text>
            )}
          </Tabs.Panel>
        ) : null}

        <Tabs.Panel value="hotspots" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <HotspotsTable
              title={t("dashboard.hotspots.current", "Top by current {{metric}}", { metric })}
              items={valueHotspots}
              showGrowth={false}
            />
            <HotspotsTable
              title={t("dashboard.hotspots.growth", "Top by {{metric}} growth", { metric })}
              items={growthHotspots}
              showGrowth
            />
          </SimpleGrid>
        </Tabs.Panel>
      </Tabs>

      {!selectedName ? (
        <Text c="dimmed">{t("dashboard.empty.pickTarget", "Run analysis and pick a target to load charts.")}</Text>
      ) : null}
    </Stack>
  );
}
