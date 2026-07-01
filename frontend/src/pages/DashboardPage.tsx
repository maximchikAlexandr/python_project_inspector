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
  fetchCommits,
  fetchHotspots,
  fetchSnapshotTableModules,
  fetchTimeseries,
  fetchUiConfig,
  type HotspotItem,
  type TimeseriesPoint,
  type UiConfigResponse,
} from "../api/client";
import { HotspotsTable } from "../components/HotspotsTable";
import { MetricChart } from "../components/MetricChart";
import { t } from "../i18n";
import {
  normalizeDashboardSelection,
  type DashboardLevel,
  type DashboardTab,
} from "../transforms/dashboardTransforms";

export function DashboardPage() {
  const [level, setLevel] = useState<DashboardLevel>("module");
  const [metric, setMetric] = useState("");
  const [agg, setAgg] = useState("mean");
  const [activeTab, setActiveTab] = useState<DashboardTab>("complexity");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [names, setNames] = useState<readonly string[]>([]);
  const [points, setPoints] = useState<readonly TimeseriesPoint[]>([]);
  const [valueHotspots, setValueHotspots] = useState<readonly HotspotItem[]>([]);
  const [growthHotspots, setGrowthHotspots] = useState<readonly HotspotItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uiConfig, setUiConfig] = useState<UiConfigResponse | null>(null);
  const hotspotsGeneration = useRef(0);
  const seriesGeneration = useRef(0);

  const metricOptions = uiConfig?.dashboard_metrics ?? [];
  const aggOptions = uiConfig?.aggregations ?? [];

  const nameOptions = useMemo(() => names.map((name) => ({ value: name, label: name })), [names]);

  useEffect(() => {
    fetchUiConfig().then(setUiConfig).catch(() => setUiConfig(null));
  }, []);

  useEffect(() => {
    if (metricOptions.length && !metric) {
      setMetric(metricOptions[0].id);
    }
  }, [metric, metricOptions]);

  useEffect(() => {
    fetchCommits()
      .then((rows) => {
        const lastCommit = rows[rows.length - 1]?.commit_hash;
        if (lastCommit) {
          fetchSnapshotTableModules(lastCommit)
            .then((payload) => {
              setNames(payload.rows.map((r) => String(r.cells.module_name)));
            })
            .catch(() => setNames([]));
        }
      })
      .catch((err: Error) => setError(err.message));
  }, []);

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
    if (!metric) return;
    const generation = hotspotsGeneration.current + 1;
    hotspotsGeneration.current = generation;
    setError(null);
    Promise.all([
      fetchHotspots({ level, metric_id: metric, by: "value", limit: 20, agg }),
      fetchHotspots({ level, metric_id: metric, by: "growth", limit: 20, agg }),
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
  }, [agg, level, metric]);

  useEffect(() => {
    if (!metric || !selectedName || !names.includes(selectedName)) {
      return;
    }
    const generation = seriesGeneration.current + 1;
    seriesGeneration.current = generation;
    setError(null);
    fetchTimeseries({ level, metric_id: metric, name: selectedName, agg })
      .then((response) => {
        if (generation !== seriesGeneration.current) {
          return;
        }
        setPoints(response.series[0]?.points ?? []);
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
          data={metricOptions.map((m) => ({ value: m.id, label: m.label }))}
          value={metric}
          onChange={(value) => setMetric(value ?? metricOptions[0]?.id ?? "")}
          w={180}
        />
        <Select
          label={t("dashboard.aggregation", "Aggregation")}
          data={aggOptions.map((a) => ({ value: a.id, label: a.label }))}
          value={agg}
          onChange={(value) => setAgg(value ?? "mean")}
          w={140}
        />
      </Group>

      <Tabs value={activeTab} onChange={(value) => setActiveTab((value as DashboardTab | null) ?? "complexity")}>
        <Tabs.List>
          <Tabs.Tab value="complexity">{t("dashboard.tabs.complexity", "Metric over time")}</Tabs.Tab>
          <Tabs.Tab value="hotspots">{t("dashboard.tabs.hotspots", "Hotspots")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="complexity" pt="md">
          <MetricChart
            title={t("dashboard.chart.complexityTitle", "{{metric}} ({{agg}}) - {{name}}", {
              metric,
              agg,
              name: selectedName ?? "",
            })}
            points={points}
            yLabel={metric}
          />
        </Tabs.Panel>

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
