import { Accordion, Center, Group, Loader, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchCommits,
  fetchGraph,
  fetchSnapshotRelations,
  fetchSnapshotTableFiles,
  fetchSnapshotTableModules,
  fetchUiConfig,
  type CommitRow,
  type GenericTableResponse,
  type GraphEdge,
  type GraphNode,
  type RelationsResponse,
} from "../api/client";
import type { UiConfigResponse } from "../api/client";
import { BrightnessToolbar } from "../components/BrightnessToolbar";
import { FileDetailPanel } from "../components/FileDetailPanel";
import { FileTreemap } from "../components/FileTreemap";
import { GraphSettingsPanel } from "../components/GraphSettingsPanel";
import { LineCategoryToolbar } from "../components/LineCategoryToolbar";
import { ModuleDetailPanel } from "../components/ModuleDetailPanel";
import { ModuleGraph } from "../components/ModuleGraph";
import { VisibleLinesSummary } from "../components/VisibleLinesSummary";
import { RelationsTable, SnapshotEntityTable } from "../components/ReportTables";
import type { TreemapFile } from "../components/FileTreemap";
import { t } from "../i18n";
import { useSnapshotGraphExplorer } from "../components/useSnapshotGraphExplorer";
import { useAppNavigation } from "../navigation";
import { lineCategoryTotal } from "../registry/odooProfile";
import { toCommitSelectOptions } from "../transforms/commitOptions";
import {
  resolveGraphSelection,
  resolveProjectStorageKey,
} from "../transforms/snapshotTransforms";
import { formatCodeLines } from "../utils/metricFormat";

function LoadingPanel({ label }: { label: string }) {
  return (
    <Paper withBorder radius="md" p="xl" bg="#fbfcfd">
      <Center>
        <Stack align="center" gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            {label}
          </Text>
        </Stack>
      </Center>
    </Paper>
  );
}

export function SnapshotPage() {
  const { pendingSnapshot, clearPendingSnapshot } = useAppNavigation();
  const [commits, setCommits] = useState<readonly CommitRow[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [modulesTable, setModulesTable] = useState<GenericTableResponse | null>(null);
  const [filesTable, setFilesTable] = useState<GenericTableResponse | null>(null);
  const [relationsData, setRelationsData] = useState<RelationsResponse | null>(null);
  const [graphNodes, setGraphNodes] = useState<readonly GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<readonly GraphEdge[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<TreemapFile | null>(null);
  const [hoveredFile, setHoveredFile] = useState<TreemapFile | null>(null);
  const [lineCategories, setLineCategories] = useState<Set<string>>(new Set());
  const [brightness, setBrightness] = useState<Set<string>>(new Set());
  const [loadingCommits, setLoadingCommits] = useState(true);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [focusNotice, setFocusNotice] = useState<string | null>(null);
  const [projectKey] = useState<string | null>(() =>
    resolveProjectStorageKey(null, null, window.location.origin + window.location.pathname),
  );
  const [uiConfig, setUiConfig] = useState<UiConfigResponse | null>(null);

  const snapshotGeneration = useRef(0);
  const graphGeneration = useRef(0);

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

  const linesTotal = useMemo(
    () => {
      if (!modulesTable) return 0;
      let total = 0;
      for (const row of modulesTable.rows) {
        const counts = (row.cells.line_counts ?? row.cells.line_categories ?? {}) as Record<string, number>;
        for (const cat of lineCategories) {
          total += counts[cat] ?? 0;
        }
      }
      return total;
    },
    [lineCategories, modulesTable],
  );

  const selectedCategoryLabels = useMemo(
    () =>
      (uiConfig?.graph.line_categories ?? [])
        .filter((o) => lineCategories.has(o.id))
        .map((o) => o.label),
    [lineCategories, uiConfig],
  );

  const moduleDetail = useMemo(() => {
    if (!modulesTable || !selectedModule) return null;
    const row = modulesTable.rows.find((r) => r.cells.module_name === selectedModule);
    if (!row) return null;
    return row.cells;
  }, [modulesTable, selectedModule]);

  const moduleVisibleLines = useMemo(
    () =>
      moduleDetail ? lineCategoryTotal(
        (moduleDetail.line_counts ?? moduleDetail.line_categories ?? {}) as Record<string, number>,
        lineCategories,
      ) : 0,
    [lineCategories, moduleDetail],
  );

  const moduleFiles = useMemo(() => {
    if (!filesTable || !selectedModule) return [];
    return filesTable.rows
      .filter((r) => r.cells.module_name === selectedModule)
      .map((r) => {
        const cells = r.cells;
        const relativePath = String(cells.relative_path ?? "");
        const metrics = (cells.metrics ?? {}) as Record<string, number>;
        const parts = relativePath.split("/");
        return {
          module_name: selectedModule,
          relative_path: relativePath,
          line_category_id: String(cells.line_category_id ?? ""),
          lines: Number(metrics.lines ?? metrics.total_lines ?? cells.total_lines ?? 0),
          top_folder: parts.length > 1 ? parts[0] : ".",
          metrics,
          distributions: (cells.distributions ?? {}) as Record<string, { median: number; mean: number; count: number; p95: number; max: number }>,
        } satisfies TreemapFile;
      });
  }, [filesTable, selectedModule]);

  const activeFile = selectedFile ?? hoveredFile;

  useEffect(() => {
    if (!pendingSnapshot) {
      return;
    }
    setSelectedCommit(pendingSnapshot.commitHash);
    if (pendingSnapshot.tab) {
      setOpenSections([pendingSnapshot.tab]);
    }
    clearPendingSnapshot();
  }, [clearPendingSnapshot, pendingSnapshot]);

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
  }, []);

  useEffect(() => {
    if (!selectedCommit) {
      return;
    }
    const generation = snapshotGeneration.current + 1;
    snapshotGeneration.current = generation;
    setSelectedFile(null);
    setHoveredFile(null);
    setModulesTable(null);
    setFilesTable(null);
    setRelationsData(null);
    setGraphNodes([]);
    setGraphEdges([]);
    setFocusNotice(null);
    resetLayoutState();
    setLoadingSnapshot(true);
    setError(null);
    Promise.all([
      fetchSnapshotTableModules(selectedCommit),
      fetchSnapshotTableFiles(selectedCommit),
      fetchSnapshotRelations(selectedCommit),
    ])
      .then(([modules, files, relations]) => {
        if (generation !== snapshotGeneration.current) {
          return;
        }
        setModulesTable(modules);
        setFilesTable(files);
        setRelationsData(relations);
      })
      .catch((err: Error) => {
        if (generation === snapshotGeneration.current) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (generation === snapshotGeneration.current) {
          setLoadingSnapshot(false);
        }
      });
  }, [resetLayoutState, selectedCommit]);

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
      <Group align="flex-end" wrap="wrap">
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
        <Text size="sm" c="dimmed">
          {t("snapshot.visibleEdges", "Visible edges: {{count}}", {
            count: loadingGraph ? "…" : filterResult.stats.visibleEdges,
          })}
        </Text>
      </Group>
      <VisibleLinesSummary
        total={linesTotal}
        selectedLabels={selectedCategoryLabels}
        loading={loadingSnapshot}
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
            <LineCategoryToolbar active={lineCategories} onChange={setLineCategories} options={uiConfig?.graph.line_categories ?? []} />
            <BrightnessToolbar active={brightness} onChange={setBrightness} options={uiConfig?.graph.brightness_metrics ?? []} />
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
            stats={filterResult.stats}
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
          loadingSnapshot ? (
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

      <Accordion
        multiple
        variant="contained"
        value={openSections}
        onChange={(value) => setOpenSections(Array.isArray(value) ? value : value ? [value] : [])}
      >
        <Accordion.Item value="lines">
          <Accordion.Control>{t("snapshot.sections.moduleLines", "Module code lines")}</Accordion.Control>
          <Accordion.Panel>
            {loadingSnapshot ? (
              <LoadingPanel label={t("snapshot.loading.moduleLines", "Loading module lines...")} />
            ) : modulesTable ? (
              <SnapshotEntityTable
                rows={modulesTable.rows}
                columns={uiConfig?.tables.find((tbl) => tbl.key === "modules")?.columns ?? []}
                filesTable={filesTable}
                fileColumns={uiConfig?.tables.find((tbl) => tbl.key === "files")?.columns ?? []}
              />
            ) : null}
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="relations">
          <Accordion.Control>{t("snapshot.sections.relations", "Relations")}</Accordion.Control>
          <Accordion.Panel>
            {loadingSnapshot ? (
              <LoadingPanel label={t("snapshot.loading.relations", "Loading relations...")} />
            ) : relationsData ? (
              <RelationsTable
                relations={relationsData.relations}
                columns={uiConfig?.tables.find((tbl) => tbl.key === "relations")?.columns ?? []}
              />
            ) : null}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}