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
  fetchHotspots,
  fetchSnapshotTableFiles,
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
import { useAppNavigation } from "../navigation";
import {
  normalizeDashboardSelection,
  validMetricsForLevel,
  type DashboardLevel,
  type DashboardTab,
  type MetricOption,
} from "../transforms/dashboardTransforms";

function toMetricOptions(
  metrics: NonNullable<UiConfigResponse["dashboard_metrics"]>,
): MetricOption[] {
  return metrics.map((m) => ({
    id: m.id,
    label: m.label,
    supportedLevels: new Set(m.supported_levels ?? (["module", "file"] as const)),
    defaultEnabled: m.default_enabled,
  }));
}

export function DashboardPage() {
  const { selectedCommit } = useAppNavigation();
  const [level, setLevel] = useState<DashboardLevel>("module");
  const [metric, setMetric] = useState<string | null>(null);
  const [agg, setAgg] = useState("mean");
  const [activeTab, setActiveTab] = useState<DashboardTab>("complexity");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [names, setNames] = useState<readonly string[]>([]);
  const [points, setPoints] = useState<readonly TimeseriesPoint[]>([]);
  const [valueHotspots, setValueHotspots] = useState<readonly HotspotItem[]>([]);
  const [growthHotspots, setGrowthHotspots] = useState<readonly HotspotItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uiConfig, setUiConfig] = useState<UiConfigResponse | null>(null);
  const [recalculatedAt, setRecalculatedAt] = useState<number | null>(null);
  const hotspotsGeneration = useRef(0);
  const seriesGeneration = useRef(0);

  const metricOptionsRaw = uiConfig?.dashboard_metrics ?? [];
  const metricOptions = useMemo(() => toMetricOptions(metricOptionsRaw), [metricOptionsRaw]);
  const aggOptions = uiConfig?.aggregations ?? [];

  const selection = useMemo(
    () =>
      normalizeDashboardSelection({
        level,
        metric,
        target: selectedName,
        metrics: metricOptions,
        targets: names,
      }),
    [level, metric, selectedName, metricOptions, names],
  );

  const nameOptions = useMemo(() => names.map((name) => ({ value: name, label: name })), [names]);

  useEffect(() => {
    fetchUiConfig().then(setUiConfig).catch(() => setUiConfig(null));
  }, []);

  useEffect(() => {
    if (metricOptions.length && metric === null) {
      const first = validMetricsForLevel(metricOptions, level)[0] ?? null;
      setMetric(first);
    }
  }, [metricOptions, level, metric]);

  useEffect(() => {
    if (level !== "module") return;
    fetchSnapshotTableModules(selectedCommit ?? undefined)
      .then((payload) => {
        setNames(payload.rows.map((r) => String(r.cells.module_name)));
      })
      .catch(() => setNames([]));
  }, [level, selection.isValid, selectedCommit]);

  useEffect(() => {
    function fromModuleLastCommit(moduleName: string): Promise<string[]> {
      return fetchSnapshotTableFiles(selectedCommit ?? undefined, moduleName).then(
        (payload) => payload.rows.map((r) => String(r.cells.relative_path ?? "")),
      );
    }

    async function fetchFileNames(): Promise<string[]> {
      const currentName = selectedName;
      if (currentName) {
        const moduleName = currentName.includes("/")
          ? currentName.split("/")[0]
          : undefined;
        return fromModuleLastCommit(moduleName ?? currentName);
      }
      if (!selectedCommit) return [];
      const modules = await fetchSnapshotTableModules(selectedCommit);
      const first = String(modules.rows[0]?.cells?.module_name ?? "");
      if (!first) return [];
      return fromModuleLastCommit(first);
    }

    if (level !== "file") return;
    fetchFileNames().then(setNames).catch(() => setNames([]));
  }, [level, selectedCommit, selectedName]);

  useEffect(() => {
    if (selection.metric !== metric) setMetric(selection.metric);
    if (selection.target !== selectedName) setSelectedName(selection.target);
  }, [selection.metric, selection.target, metric, selectedName]);

  useEffect(() => {
    if (!selection.isValid || !selection.metric) {
      setPoints([]);
      setValueHotspots([]);
      setGrowthHotspots([]);
      return;
    }
    const generation = hotspotsGeneration.current + 1;
    hotspotsGeneration.current = generation;
    setError(null);
    Promise.all([
      fetchHotspots({ level, metric_id: selection.metric, by: "value", limit: 20, agg }),
      fetchHotspots({ level, metric_id: selection.metric, by: "growth", limit: 20, agg }),
    ])
      .then(([byValue, byGrowth]) => {
        if (generation !== hotspotsGeneration.current) return;
        setValueHotspots(byValue.items);
        setGrowthHotspots(byGrowth.items);
        setRecalculatedAt(Date.now());
      })
      .catch((err: Error) => {
        if (generation === hotspotsGeneration.current) {
          setError(err.message);
        }
      });
  }, [agg, level, selection.isValid, selection.metric]);

  useEffect(() => {
    if (!selection.isValid || !selection.metric || !selection.target) {
      setPoints([]);
      return;
    }
    const generation = seriesGeneration.current + 1;
    seriesGeneration.current = generation;
    setError(null);
    fetchTimeseries({ level, metric_id: selection.metric, name: selection.target, agg })
      .then((response) => {
        if (generation !== seriesGeneration.current) return;
        setPoints(response.series[0]?.points ?? []);
        setRecalculatedAt(Date.now());
      })
      .catch((err: Error) => {
        if (generation === seriesGeneration.current) {
          setError(err.message);
        }
      });
  }, [agg, level, selection.isValid, selection.metric, selection.target]);

  const validMetrics = selection.validMetrics;
  const validMetricOptions = metricOptions.filter((m) => validMetrics.includes(m.id));
  const metricDisabled = validMetricOptions.length === 0;
  const targetDisabled = selection.validTargets.length === 0;
  const aggregationLabel = aggOptions.find((a) => a.id === agg)?.label ?? agg;

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
          onChange={(value) => setLevel((value as DashboardLevel | null) ?? "module")}
          w={140}
        />
        <Select
          label={t("dashboard.target", "Target")}
          data={nameOptions}
          value={selectedName}
          onChange={setSelectedName}
          searchable
          nothingFoundMessage={
            targetDisabled
              ? t("common.unavailable", "Unavailable")
              : t("dashboard.noTargets", "No targets")
          }
          w={320}
          disabled={targetDisabled}
        />
        <Select
          label={t("dashboard.metric", "Metric")}
          data={validMetricOptions.map((m) => ({ value: m.id, label: m.label }))}
          value={metric ?? ""}
          onChange={(value) => setMetric(value ?? null)}
          w={180}
          disabled={metricDisabled}
          nothingFoundMessage={t("dashboard.noMetric", "No metric available")}
        />
        <Select
          label={t("dashboard.aggregation", "Aggregation")}
          data={aggOptions.map((a) => ({ value: a.id, label: a.label }))}
          value={agg}
          onChange={(value) => setAgg(value ?? "mean")}
          w={140}
        />
      </Group>

      {metricDisabled || targetDisabled ? (
        <Alert color="gray" variant="light">
          {targetDisabled
            ? t("common.unavailable", "Unavailable")
            : t("dashboard.noMetric", "No metric available")}
        </Alert>
      ) : null}

      <Text size="sm" c="dimmed">
        {t("dashboard.aggregation.meta", "Aggregation: {{agg}}", { agg: aggregationLabel })}
        {recalculatedAt
          ? ` · ${t("dashboard.recalculated", "Recalculated for {{agg}}", { agg: aggregationLabel })}`
          : ""}
      </Text>

      <Tabs value={activeTab} onChange={(value) => setActiveTab((value as DashboardTab | null) ?? "complexity")}>
        <Tabs.List>
          <Tabs.Tab value="complexity">{t("dashboard.tabs.complexity", "Metric over time")}</Tabs.Tab>
          <Tabs.Tab value="hotspots">{t("dashboard.tabs.hotspots", "Hotspots")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="complexity" pt="md">
          <MetricChart
            title={t("dashboard.chart.complexityTitle", "{{metric}} ({{agg}}) - {{name}}", {
              metric: metric ?? "",
              agg: aggregationLabel,
              name: selectedName ?? "",
            })}
            points={points}
            yLabel={metric ?? ""}
          />
        </Tabs.Panel>

        <Tabs.Panel value="hotspots" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <HotspotsTable
              title={t("dashboard.hotspots.current", "Top by current {{metric}}", { metric: metric ?? "" })}
              items={valueHotspots}
              showGrowth={false}
            />
            <HotspotsTable
              title={t("dashboard.hotspots.growth", "Top by {{metric}} growth", { metric: metric ?? "" })}
              items={growthHotspots}
              showGrowth
            />
          </SimpleGrid>
        </Tabs.Panel>
      </Tabs>

      {!selection.isValid ? (
        <Text c="dimmed">{t("common.unavailable", "Unavailable")}</Text>
      ) : null}
    </Stack>
  );
}
