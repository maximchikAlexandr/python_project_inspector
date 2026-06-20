import { Checkbox, Group, Select, Stack, Tabs, Text, Title } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchCommits,
  fetchFailures,
  fetchGraph,
  fetchSnapshotFiles,
  fetchSnapshotModules,
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
import { LineCategoryToolbar } from "../components/LineCategoryToolbar";
import { ManifestDependsView } from "../components/ManifestDependsView";
import { ModuleDetailPanel } from "../components/ModuleDetailPanel";
import { ModuleGraph } from "../components/ModuleGraph";
import { ParseFailureView } from "../components/ParseFailureView";
import { EdgePointsTable, FileComplexityTable, ModuleLinesTable } from "../components/ReportTables";
import {
  type BrightnessCriterion,
  type LineCategoryKey,
  LINE_CATEGORIES,
} from "../registry/odooProfile";

function graphEdgesToRows(edges: GraphEdge[], commitHash: string): EdgeRow[] {
  return edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    score: edge.score,
    kinds: {},
    breakdown: edge.breakdown,
    commit_hash: commitHash,
  }));
}

export function SnapshotPage() {
  const [commits, setCommits] = useState<CommitRow[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleSnapshot[]>([]);
  const [files, setFiles] = useState<FileSnapshot[]>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [failures, setFailures] = useState<FailureRow[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileSnapshot | null>(null);
  const [lineCategories, setLineCategories] = useState<Set<LineCategoryKey>>(
    () => new Set(LINE_CATEGORIES.map(({ key }) => key)),
  );
  const [brightness, setBrightness] = useState<Set<BrightnessCriterion>>(new Set(["cyclomatic_median"]));
  const [includeZeroScore, setIncludeZeroScore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshotGeneration = useRef(0);
  const graphGeneration = useRef(0);

  const commitOptions = useMemo(
    () =>
      commits.map((row) => ({
        value: row.commit_hash,
        label: `#${row.commit_order} ${row.commit_hash.slice(0, 8)} ${row.summary ?? ""}`,
      })),
    [commits],
  );

  const moduleFiles = useMemo(
    () => (selectedModule ? files.filter((file) => file.module_name === selectedModule) : []),
    [files, selectedModule],
  );

  const moduleDetail = useMemo(
    () => modules.find((module) => module.module_name === selectedModule) ?? null,
    [modules, selectedModule],
  );

  const edgeRows = useMemo(
    () => (selectedCommit ? graphEdgesToRows(graphEdges, selectedCommit) : []),
    [graphEdges, selectedCommit],
  );

  useEffect(() => {
    fetchCommits()
      .then((rows) => {
        setCommits(rows);
        setSelectedCommit(rows[rows.length - 1]?.commit_hash ?? null);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedCommit) {
      return;
    }
    const generation = snapshotGeneration.current + 1;
    snapshotGeneration.current = generation;
    setSelectedModule(null);
    setSelectedFile(null);
    setModules([]);
    setFiles([]);
    setFailures([]);
    setGraphNodes([]);
    setGraphEdges([]);
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
      });
  }, [selectedCommit]);

  useEffect(() => {
    if (!selectedCommit) {
      return;
    }
    const generation = graphGeneration.current + 1;
    graphGeneration.current = generation;
    fetchGraph(selectedCommit, includeZeroScore)
      .then((graphPayload) => {
        if (generation !== graphGeneration.current) {
          return;
        }
        setGraphNodes(graphPayload.nodes);
        setGraphEdges(graphPayload.edges);
      })
      .catch((err: Error) => {
        if (generation === graphGeneration.current) {
          setError(err.message);
        }
      });
  }, [includeZeroScore, selectedCommit]);

  return (
    <Stack gap="md">
      <Title order={3}>Odoo report snapshot</Title>
      {error ? <Text c="red">{error}</Text> : null}
      <Group align="flex-end" wrap="wrap">
        <Select
          label="Commit"
          data={commitOptions}
          value={selectedCommit}
          onChange={setSelectedCommit}
          searchable
          w={420}
        />
        <Checkbox
          label="Include zero-score edges"
          checked={includeZeroScore}
          onChange={(event) => setIncludeZeroScore(event.currentTarget.checked)}
        />
        <Text size="sm" c="dimmed">
          Visible edges: {edgeRows.length}
        </Text>
      </Group>
      <LineCategoryToolbar active={lineCategories} onChange={setLineCategories} />
      <BrightnessToolbar active={brightness} onChange={setBrightness} />
      <Tabs defaultValue="graph">
        <Tabs.List>
          <Tabs.Tab value="graph">Graph</Tabs.Tab>
          <Tabs.Tab value="treemap">Treemap</Tabs.Tab>
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="lines">Module lines</Tabs.Tab>
          <Tabs.Tab value="complexity">File complexity</Tabs.Tab>
          <Tabs.Tab value="edges">Edge points</Tabs.Tab>
          <Tabs.Tab value="manifest">Manifest depends</Tabs.Tab>
          <Tabs.Tab value="failures">Parse failures</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="graph" pt="md">
          <ModuleGraph
            nodes={graphNodes}
            edges={graphEdges}
            lineCategories={lineCategories}
            brightnessCriteria={brightness}
            selectedModule={selectedModule}
            onSelectModule={setSelectedModule}
          />
        </Tabs.Panel>
        <Tabs.Panel value="treemap" pt="md">
          {selectedModule ? (
            <FileTreemap
              files={moduleFiles}
              lineCategories={lineCategories}
              selectedPath={
                selectedFile ? `${selectedFile.module_name}/${selectedFile.relative_path}` : null
              }
              onSelect={setSelectedFile}
            />
          ) : (
            <Text c="dimmed">Select a module on the graph to open its treemap.</Text>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="details" pt="md">
          <Stack gap="md">
            <ModuleDetailPanel module={moduleDetail} />
            <FileDetailPanel file={selectedFile} />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="lines" pt="md">
          <ModuleLinesTable modules={modules} />
        </Tabs.Panel>
        <Tabs.Panel value="complexity" pt="md">
          <FileComplexityTable files={files} />
        </Tabs.Panel>
        <Tabs.Panel value="edges" pt="md">
          {selectedCommit ? (
            <EdgePointsTable edges={edgeRows} commit={selectedCommit} includeZeroScore={includeZeroScore} />
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel value="manifest" pt="md">
          <ManifestDependsView modules={modules} />
        </Tabs.Panel>
        <Tabs.Panel value="failures" pt="md">
          <ParseFailureView failures={failures} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
