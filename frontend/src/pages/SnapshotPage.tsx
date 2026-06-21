import { Accordion, Center, Group, Loader, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchCommits,
  fetchFailures,
  fetchGraph,
  fetchSnapshotFiles,
  fetchSnapshotModules,
  fetchStatus,
  type CommitRow,
  type EdgeRow,
  type FailureRow,
  type FileSnapshot,
  type GraphEdge,
  type GraphNode,
  type ModuleSnapshot,
} from "../api/client";
import { BrightnessToolbar } from "../components/BrightnessToolbar";
import { FileDetailPanel } from "../components/FileDetailPanel";
import { FileTreemap } from "../components/FileTreemap";
import { GraphSettingsPanel } from "../components/GraphSettingsPanel";
import { LineCategoryToolbar } from "../components/LineCategoryToolbar";
import { ManifestDependsView } from "../components/ManifestDependsView";
import { ModuleDetailPanel } from "../components/ModuleDetailPanel";
import { ModuleGraph } from "../components/ModuleGraph";
import { ParseFailureView } from "../components/ParseFailureView";
import { VisibleLinesSummary } from "../components/VisibleLinesSummary";
import { EdgePointsTable, FileComplexityTable, ModuleLinesTable } from "../components/ReportTables";
import { t } from "../i18n";
import { useSnapshotGraphExplorer } from "../components/useSnapshotGraphExplorer";
import { useAppNavigation } from "../navigation";
import {
  type BrightnessCriterion,
  DEFAULT_BRIGHTNESS_CRITERIA,
  DEFAULT_LINE_CATEGORIES,
  type LineCategoryKey,
  LINE_CATEGORIES,
  lineCategoryTotal,
  moduleCouplingStats,
} from "../registry/odooProfile";
import { toCommitSelectOptions } from "../transforms/commitOptions";
import {
  graphEdgesToRows,
  moduleOptionsFromModules,
  resolveGraphSelection,
  resolveProjectStorageKey,
  visibleLinesTotal,
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

function lineCategoryLabel(key: LineCategoryKey, fallback: string): string {
  switch (key) {
    case "python_lines":
      return t("lineCategory.pythonCode", "Python code");
    case "js_lines":
      return t("lineCategory.js", "JS");
    case "python_test_lines":
      return t("lineCategory.pythonTest", "Python test");
    case "xml_lines":
      return t("lineCategory.xmlView", "XML view");
    case "css_lines":
      return t("lineCategory.css", "CSS");
    case "html_lines":
      return t("lineCategory.html", "HTML");
    default:
      return fallback;
  }
}

export function SnapshotPage() {
  const { pendingSnapshot, clearPendingSnapshot } = useAppNavigation();
  const [commits, setCommits] = useState<CommitRow[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleSnapshot[]>([]);
  const [files, setFiles] = useState<FileSnapshot[]>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [fullEdges, setFullEdges] = useState<EdgeRow[]>([]);
  const [failures, setFailures] = useState<FailureRow[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileSnapshot | null>(null);
  const [hoveredFile, setHoveredFile] = useState<FileSnapshot | null>(null);
  const [lineCategories, setLineCategories] = useState<Set<LineCategoryKey>>(
    () => new Set(DEFAULT_LINE_CATEGORIES),
  );
  const [brightness, setBrightness] = useState<Set<BrightnessCriterion>>(
    () => new Set(DEFAULT_BRIGHTNESS_CRITERIA),
  );
  const [loadingCommits, setLoadingCommits] = useState(true);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [focusNotice, setFocusNotice] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(() =>
    resolveProjectStorageKey(null, null, window.location.origin + window.location.pathname),
  );

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

  const moduleFiles = useMemo(
    () => (selectedModule ? files.filter((file) => file.module_name === selectedModule) : []),
    [files, selectedModule],
  );

  const moduleDetail = useMemo(
    () => modules.find((module) => module.module_name === selectedModule) ?? null,
    [modules, selectedModule],
  );

  const selectedCouplingStats = useMemo(
    () =>
      selectedModule && fullEdges.length ? moduleCouplingStats(selectedModule, fullEdges) : null,
    [fullEdges, selectedModule],
  );

  const linesTotal = useMemo(
    () => visibleLinesTotal(modules, lineCategories),
    [lineCategories, modules],
  );

  const selectedCategoryLabels = useMemo(
    () =>
      LINE_CATEGORIES.filter(({ key }) => lineCategories.has(key)).map(({ key, label }) =>
        lineCategoryLabel(key, label),
      ),
    [lineCategories],
  );

  const moduleOptions = useMemo(() => moduleOptionsFromModules(modules), [modules]);

  const activeFile = selectedFile ?? hoveredFile;

  const moduleVisibleLines = useMemo(
    () =>
      moduleDetail ? lineCategoryTotal(moduleDetail.line_categories, lineCategories) : 0,
    [lineCategories, moduleDetail],
  );

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
    fetchStatus()
      .then((status) => {
        setProjectKey(
          resolveProjectStorageKey(
            status.project_id,
            status.scope?.repo_path ?? null,
            window.location.origin + window.location.pathname,
          ),
        );
      })
      .catch(() => undefined);
  }, []);

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
    setModules([]);
    setFiles([]);
    setFailures([]);
    setGraphNodes([]);
    setGraphEdges([]);
    setFullEdges([]);
    setFocusNotice(null);
    resetLayoutState();
    setLoadingSnapshot(true);
    setError(null);
    Promise.all([
      fetchSnapshotModules(selectedCommit),
      fetchSnapshotFiles(selectedCommit),
      fetchFailures(selectedCommit),
    ])
      .then(([modulePayload, filePayload, failurePayload]) => {
        if (generation !== snapshotGeneration.current) {
          return;
        }
        setModules(modulePayload.modules);
        setFiles(filePayload.files);
        setFailures(failurePayload.failures);
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
    setFullEdges([]);
    setLoadingGraph(true);
    setError(null);
    fetchGraph(selectedCommit, settings.filter.includeZeroScore)
      .then((graphPayload) => {
        if (generation !== graphGeneration.current) {
          return;
        }
        setGraphNodes(graphPayload.nodes);
        setGraphEdges(graphPayload.edges);
        setFullEdges(graphEdgesToRows(graphPayload.edges, graphPayload.commit_hash));
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
      <Title order={3}>{t("snapshot.title", "Odoo report snapshot")}</Title>
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
            <LineCategoryToolbar active={lineCategories} onChange={setLineCategories} />
            <BrightnessToolbar active={brightness} onChange={setBrightness} />
            {loadingSnapshot && selectedModule && !moduleDetail ? (
              <LoadingPanel label={t("snapshot.loading.moduleDetails", "Loading module details...")} />
            ) : (
              <ModuleDetailPanel
                module={moduleDetail}
                brightnessCriteria={brightness}
                couplingStats={selectedCouplingStats}
              />
            )}
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
            ) : (
              <ModuleLinesTable modules={modules} />
            )}
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="complexity">
          <Accordion.Control>{t("snapshot.sections.fileComplexity", "Python file complexity")}</Accordion.Control>
          <Accordion.Panel>
            {loadingSnapshot ? (
              <LoadingPanel label={t("snapshot.loading.fileComplexity", "Loading file complexity...")} />
            ) : (
              <FileComplexityTable files={files} />
            )}
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="edges">
          <Accordion.Control>{t("snapshot.sections.edgePoints", "Graph edge points")}</Accordion.Control>
          <Accordion.Panel>
            {loadingGraph ? (
              <LoadingPanel label={t("snapshot.loading.edgePoints", "Loading edge points...")} />
            ) : selectedCommit ? (
              <EdgePointsTable
                edges={fullEdges}
                commit={selectedCommit}
                includeZeroScore={settings.filter.includeZeroScore}
                moduleOptions={moduleOptions}
              />
            ) : null}
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="manifest">
          <Accordion.Control>{t("snapshot.sections.manifestDepends", "Manifest depends")}</Accordion.Control>
          <Accordion.Panel>
            {loadingSnapshot ? (
              <LoadingPanel label={t("snapshot.loading.manifest", "Loading manifest data...")} />
            ) : (
              <ManifestDependsView modules={modules} />
            )}
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="failures">
          <Accordion.Control>{t("snapshot.sections.parseFailures", "Parse failures")}</Accordion.Control>
          <Accordion.Panel>
            {loadingSnapshot ? (
              <LoadingPanel label={t("snapshot.loading.parseFailures", "Loading parse failures...")} />
            ) : (
              <ParseFailureView failures={failures} />
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
