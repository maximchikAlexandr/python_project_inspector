import { Group, Loader, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchCommits,
  fetchGraph,
  fetchSnapshotTableFiles,
  fetchUiConfig,
  type CommitRow,
  type GraphEdge,
  type GraphNode,
} from "../api/client";
import type { UiConfigResponse } from "../api/client";
import { FileDetailPanel } from "../components/FileDetailPanel";
import { FileTreemap } from "../components/FileTreemap";
import { GraphSettingsPanel } from "../components/GraphSettingsPanel";
import { ModuleDetailPanel } from "../components/ModuleDetailPanel";
import { ModuleGraph } from "../components/ModuleGraph";
import { VisibleLinesSummary } from "../components/VisibleLinesSummary";
import type { TreemapFile } from "../components/FileTreemap";
import { t } from "../i18n";
import { useSnapshotGraphExplorer } from "../components/useSnapshotGraphExplorer";
import { useAppNavigation } from "../navigation";
import { lineCategoryTotal } from "../registry/graphUiHelpers";
import { toCommitSelectOptions } from "../transforms/commitOptions";
import { formatCommitDate } from "../transforms/commitDate";
import {
  resolveGraphSelection,
  resolveProjectStorageKey,
} from "../transforms/snapshotTransforms";
import { formatCodeLines } from "../utils/metricFormat";
import { LoadingPanel } from "../components/LoadingPanel";

export function SnapshotPage() {
  const { selectedCommit, setSelectedCommit } = useAppNavigation();
  const [commits, setCommits] = useState<readonly CommitRow[]>([]);
  const [filesTable, setFilesTable] = useState<Awaited<ReturnType<typeof fetchSnapshotTableFiles>> | null>(null);
  const [graphNodes, setGraphNodes] = useState<readonly GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<readonly GraphEdge[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<TreemapFile | null>(null);
  const [hoveredFile, setHoveredFile] = useState<TreemapFile | null>(null);
  const [lineCategories, setLineCategories] = useState<Set<string>>(new Set());
  const [brightness, setBrightness] = useState<Set<string>>(new Set());
  const [loadingCommits, setLoadingCommits] = useState(true);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusNotice, setFocusNotice] = useState<string | null>(null);
  const [projectKey] = useState<string | null>(() =>
    resolveProjectStorageKey(null, null, window.location.origin + window.location.pathname),
  );
  const [uiConfig, setUiConfig] = useState<UiConfigResponse | null>(null);

  const graphGeneration = useRef(0);
  const defaultEnabledEdgeKinds = useMemo(
    () => Object.fromEntries((uiConfig?.graph.edge_types ?? []).map((option) => [option.id, true])),
    [uiConfig],
  );

  const commitOptions = useMemo(() => toCommitSelectOptions(commits), [commits]);
  const graphExplorer = useSnapshotGraphExplorer({
    commits,
    selectedCommit,
    setSelectedCommit,
    graphNodes,
    graphEdges,
    selectedModule,
    setSelectedModule,
    setSelectedFile,
    setHoveredFile,
    projectKey,
    loadingGraph,
    setFocusNotice,
    defaultEnabledEdgeKinds,
  });
  const {
    edgeKindMeta,
    emptyNotice,
    filterResult,
    focusModuleRef,
    graphPanelProps,
    maxEffectiveScore,
    onSelectModule,
    resetLayoutState,
    selectedCommitDisabled,
    setFilter,
    settings,
  } = graphExplorer;

  const selectedCommitMeta = useMemo(
    () => commits.find((row) => row.commit_hash === selectedCommit) ?? null,
    [commits, selectedCommit],
  );
  const commitDateLabel = useMemo(
    () => formatCommitDate(selectedCommitMeta?.authored_at ?? null),
    [selectedCommitMeta],
  );
  const edgeKindConfigLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const opt of uiConfig?.graph.edge_types ?? []) {
      map[opt.id] = opt.label;
    }
    return map;
  }, [uiConfig]);

  const selectedCategoryLabels = useMemo(
    () =>
      (uiConfig?.graph.line_categories ?? [])
        .filter((o) => lineCategories.has(o.id))
        .map((o) => o.label),
    [lineCategories, uiConfig],
  );

  const moduleDetail = useMemo(() => {
    if (!filesTable || !selectedModule) return null;
    const row = filesTable.rows.find((r) => r.cells.module_name === selectedModule);
    if (!row) return null;
    return row.cells;
  }, [filesTable, selectedModule]);

  const moduleVisibleLines = useMemo(
    () =>
      moduleDetail ? lineCategoryTotal(
        (moduleDetail.line_counts ?? {}) as Record<string, number>,
        lineCategories,
      ) : 0,
    [lineCategories, moduleDetail],
  );

  const moduleFiles = useMemo<TreemapFile[]>(() => {
    if (!filesTable || !selectedModule) return [];
    return filesTable.rows
      .filter((r) => r.cells.module_name === selectedModule)
      .map((r) => {
        const cells = r.cells;
        const relativePath = String(cells.relative_path ?? "");
        const metrics = (cells.metrics ?? {}) as Record<string, number>;
        const lineCounts = (cells.line_counts ?? {}) as Record<string, number>;
        const parts = relativePath.split("/");
        return {
          module_name: selectedModule,
          relative_path: relativePath,
          line_category_id: String(cells.line_category_id ?? ""),
          lines: Number(lineCounts.lines ?? metrics.lines ?? metrics.total_lines ?? cells.total_lines ?? 0),
          top_folder: parts.length > 1 ? parts[0] : ".",
          metrics,
          line_counts: lineCounts,
          distributions: (cells.distributions ?? {}) as Record<string, { median: number; mean: number; count: number; p95: number; max: number }>,
        } satisfies TreemapFile;
      });
  }, [filesTable, selectedModule]);

  const activeFile = selectedFile ?? hoveredFile;

  useEffect(() => {
    fetchUiConfig().then(setUiConfig).catch(() => setUiConfig(null));
  }, []);

  useEffect(() => {
    if (uiConfig) {
      const defaults = uiConfig.graph.line_categories.filter((o) => o.default_enabled).map((o) => o.id);
      setLineCategories(new Set(defaults));
    }
  }, [uiConfig]);

  useEffect(() => {
    if (uiConfig) {
      const defaults = uiConfig.graph.brightness_metrics.filter((o) => o.default_enabled).map((o) => o.id);
      setBrightness(new Set(defaults));
    }
  }, [uiConfig]);

  useEffect(() => {
    setLoadingCommits(true);
    fetchCommits()
      .then((rows) => {
        setCommits(rows);
        setSelectedCommit((current) => current ?? rows[rows.length - 1]?.commit_hash ?? null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingCommits(false));
  }, [setSelectedCommit]);

  useEffect(() => {
    if (!selectedCommit) {
      setFilesTable(null);
      return;
    }
    setSelectedFile(null);
    setHoveredFile(null);
    setFocusNotice(null);
    resetLayoutState();
    setError(null);
    fetchSnapshotTableFiles(selectedCommit)
      .then((files) => {
        setFilesTable(files);
        if (selectedModule) {
          const exists = files.rows.some((r) => r.cells.module_name === selectedModule);
          if (!exists) {
            setSelectedModule(null);
          }
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [resetLayoutState, selectedCommit, selectedModule]);

  useEffect(() => {
    if (!selectedCommit) {
      return;
    }
    const generation = graphGeneration.current + 1;
    graphGeneration.current = generation;
    setGraphNodes([]);
    setGraphEdges([]);
    setLoadingGraph(true);
    setError(null);
    fetchGraph(selectedCommit, settings.filter.includeZeroScore)
      .then((graphPayload) => {
        if (generation !== graphGeneration.current) {
          return;
        }
        setGraphNodes(graphPayload.nodes);
        setGraphEdges(graphPayload.edges);
        const selection = resolveGraphSelection(graphPayload.nodes, focusModuleRef.current);
        setSelectedModule(selection.selectedModule);
        if (selection.clearFocus) {
          setFilter({ focusEnabled: false, focusModule: null });
        }
        if (selection.notice) {
          setFocusNotice(selection.notice);
        }
      })
      .catch((err: Error) => {
        if (generation === graphGeneration.current) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (generation === graphGeneration.current) {
          setLoadingGraph(false);
        }
      });
  }, [focusModuleRef, selectedCommit, setFilter, settings.filter.includeZeroScore]);

  return (
    <Stack gap="md">
      <Title order={3}>{t("snapshot.title", "Report snapshot")}</Title>
      {error ? <Text c="red">{error}</Text> : null}
      {focusNotice ? (
        <Text size="sm" c="orange">
          {focusNotice}
        </Text>
      ) : null}
      <Group align="flex-end" wrap="wrap" gap="md">
        <Select
          label={t("common.commit", "Commit")}
          data={commitOptions}
          value={selectedCommit}
          onChange={setSelectedCommit}
          searchable
          w={420}
          disabled={loadingCommits || selectedCommitDisabled}
          rightSection={loadingCommits ? <Loader size="xs" /> : undefined}
        />
        <Text size="sm" c="dimmed" aria-label={t("common.commitDateUnavailable", "Date unavailable")}>
          {commitDateLabel
            ? t("snapshot.commitDate", "Commit date: {{date}}", { date: commitDateLabel })
            : t("common.commitDateUnavailable", "Date unavailable")}
        </Text>
        <Text size="sm" c="dimmed">
          {t("snapshot.visibleEdges", "Visible edges: {{count}}", {
            count: loadingGraph ? "…" : filterResult.stats.visibleEdges,
          })}
        </Text>
      </Group>
      <VisibleLinesSummary
        total={moduleFiles.length ? moduleVisibleLines : 0}
        selectedLabels={selectedCategoryLabels}
        loading={false}
      />

      <Paper withBorder radius="md" p="md">
        <Title order={4} mb="xs">
          {t("snapshot.graphView", "Graph view")}
        </Title>
        <Group align="flex-start" wrap="nowrap" gap="md" style={{ alignItems: "stretch" }}>
          <Stack gap="md" style={{ flex: 1, minWidth: "60%" }}>
            <ModuleGraph
              nodes={filterResult.nodes}
              edges={filterResult.edges}
              display={settings.display}
              force={settings.force}
              enabledEdgeKinds={settings.filter.enabledEdgeKinds}
              lineCategories={lineCategories}
              brightnessCriteria={brightness}
              selectedModule={selectedModule}
              onSelectModule={onSelectModule}
              pinned={graphPanelProps.pinned}
              onTogglePin={graphPanelProps.onTogglePin}
              layoutCommand={graphPanelProps.layoutCommand}
              onLayoutSnapshot={graphPanelProps.onLayoutSnapshot}
              zoomCommand={graphPanelProps.zoomCommand}
              loading={loadingGraph}
              emptyNotice={emptyNotice}
              initialLayout={graphPanelProps.initialLayout}
            />
            <ModuleDetailPanel
              module={moduleDetail}
              brightnessCriteria={brightness}
              metricOptions={uiConfig?.graph.brightness_metrics ?? []}
              lineCategoryOptions={uiConfig?.graph.line_categories ?? []}
            />
          </Stack>
          <GraphSettingsPanel
            settings={settings}
            onFilterChange={graphPanelProps.setFilter}
            onDisplayChange={graphPanelProps.setDisplay}
            onForceChange={graphPanelProps.setForce}
            onSectionsExpandedChange={graphPanelProps.setSectionsExpanded}
            onResetForces={graphPanelProps.resetForces}
            onResetAll={graphPanelProps.onResetAll}
            onZoom={graphPanelProps.onZoom}
            onLayout={graphPanelProps.onLayout}
            onClearFocus={graphPanelProps.onClearFocus}
            onPinSelected={graphPanelProps.onPinSelected}
            edgeKindMeta={edgeKindMeta}
            maxEffectiveScore={maxEffectiveScore}
            selectedModule={selectedModule}
            commits={commits}
            selectedCommit={selectedCommit}
            commitPositionLabel={graphPanelProps.commitLabel}
            timelapse={graphPanelProps.timelapse}
            onTimelapse={graphPanelProps.onTimelapse}
            collapsed={graphPanelProps.panelCollapsed}
            onToggleCollapsed={graphPanelProps.onToggleCollapsed}
            saveNotice={graphPanelProps.panelSaveNotice}
            nodeSizeOptions={uiConfig?.graph.node_size_metrics}
            linkThicknessOptions={uiConfig?.graph.link_thickness_metrics}
            lineCategoryOptions={uiConfig?.graph.line_categories}
            lineCategoryActive={lineCategories}
            onLineCategoryChange={setLineCategories}
            brightnessOptions={uiConfig?.graph.brightness_metrics}
            brightnessActive={brightness}
            onBrightnessChange={setBrightness}
            edgeKindConfigLabels={edgeKindConfigLabels}
          />
        </Group>
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Title order={4} mb="xs">
          {t("snapshot.moduleFileMap", "Module file map")}
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          {t("snapshot.treemapHelp", "Treemap of files inside the selected module. Tile area is proportional to line count.")}
        </Text>
        <Text size="sm" mb="sm" c={selectedModule ? undefined : "dimmed"}>
          {selectedModule
            ? t("snapshot.moduleVisibleLines", "Module {{module}}: {{lines}} visible lines", {
                module: selectedModule,
                lines: formatCodeLines(moduleVisibleLines),
              })
            : t("snapshot.empty.selectModule", "Click a module on the graph to see its file map.")}
        </Text>
        {selectedModule ? (
          loadingGraph ? (
            <LoadingPanel label={t("snapshot.loading.moduleFiles", "Loading module files...")} />
          ) : (
            <Stack gap="md">
              <FileTreemap
                files={moduleFiles}
                lineCategories={lineCategories}
                selectedPath={
                  selectedFile ? `${selectedFile.module_name}/${selectedFile.relative_path}` : null
                }
                onSelect={setSelectedFile}
                onHover={setHoveredFile}
              />
              <FileDetailPanel file={activeFile} />
            </Stack>
          )
        ) : (
          <FileDetailPanel file={null} />
        )}
      </Paper>
    </Stack>
  );
}
