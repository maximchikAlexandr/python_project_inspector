import { NumberInput, Table, Text, TextInput } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchEdgePointsBatch,
  type EdgePointsResponse,
  type EdgeRow,
  type EvidenceRow,
  type FileSnapshot,
  type ModuleSnapshot,
} from "../api/client";
import { LINE_CATEGORIES } from "../registry/odooProfile";

const EDGE_POINTS_BATCH_SIZE = 500;

type CategoryRow = {
  source: string;
  target: string;
  category: string;
  points: number;
  why: string;
  total: number;
  evidenceKey: string;
};

type Props = {
  modules: ModuleSnapshot[];
};

export function ModuleLinesTable({ modules }: Props) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(
    () => modules.filter((module) => module.module_name.includes(filter)),
    [filter, modules],
  );
  return (
    <>
      <TextInput label="Module filter" value={filter} onChange={(event) => setFilter(event.currentTarget.value)} mb="sm" />
      <Text size="sm" mb="xs">
        Visible rows: {rows.length}
      </Text>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Module</Table.Th>
            <Table.Th>Total</Table.Th>
            {LINE_CATEGORIES.map(({ key, label }) => (
              <Table.Th key={key}>{label}</Table.Th>
            ))}
            <Table.Th>Cyclo mean</Table.Th>
            <Table.Th>Cog mean</Table.Th>
            <Table.Th>Jones mean</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((module) => (
            <Table.Tr key={module.module_name}>
              <Table.Td>{module.module_name}</Table.Td>
              <Table.Td>{module.total_lines}</Table.Td>
              {LINE_CATEGORIES.map(({ key }) => (
                <Table.Td key={key}>{module.line_categories[key] ?? 0}</Table.Td>
              ))}
              <Table.Td>{module.cyclomatic.mean.toFixed(2)}</Table.Td>
              <Table.Td>{module.cognitive.mean.toFixed(2)}</Table.Td>
              <Table.Td>{module.jones.mean.toFixed(2)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

export function FileComplexityTable({ files }: { files: FileSnapshot[] }) {
  const [moduleFilter, setModuleFilter] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const rows = useMemo(
    () =>
      files.filter(
        (file) =>
          file.module_name.includes(moduleFilter) && file.relative_path.includes(pathFilter),
      ),
    [files, moduleFilter, pathFilter],
  );
  return (
    <>
      <TextInput label="Module filter" value={moduleFilter} onChange={(e) => setModuleFilter(e.currentTarget.value)} mb="xs" />
      <TextInput label="Path filter" value={pathFilter} onChange={(e) => setPathFilter(e.currentTarget.value)} mb="sm" />
      <Text size="sm" mb="xs">
        Visible rows: {rows.length}
      </Text>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Module</Table.Th>
            <Table.Th>File</Table.Th>
            <Table.Th>Lines</Table.Th>
            <Table.Th>Functions</Table.Th>
            <Table.Th>AST</Table.Th>
            <Table.Th>Cyclo</Table.Th>
            <Table.Th>Cog</Table.Th>
            <Table.Th>Jones</Table.Th>
            <Table.Th>Parse error</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((file) => (
            <Table.Tr key={`${file.module_name}/${file.relative_path}`}>
              <Table.Td>{file.module_name}</Table.Td>
              <Table.Td>{file.relative_path}</Table.Td>
              <Table.Td>{file.lines}</Table.Td>
              <Table.Td>{file.function_count}</Table.Td>
              <Table.Td>{file.jones_line_count}</Table.Td>
              <Table.Td>{file.cyclomatic.mean.toFixed(2)}</Table.Td>
              <Table.Td>{file.cognitive.mean.toFixed(2)}</Table.Td>
              <Table.Td>{file.jones.mean.toFixed(2)}</Table.Td>
              <Table.Td>{file.parse_error ?? "—"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

export function EdgePointsTable({
  edges,
  commit,
  includeZeroScore,
}: {
  edges: EdgeRow[];
  commit: string;
  includeZeroScore: boolean;
}) {
  const [sourceFilter, setSourceFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [minPoints, setMinPoints] = useState(0);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);
  const [evidenceRows, setEvidenceRows] = useState<EvidenceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingCount, setMissingCount] = useState(0);
  const payloadCache = useRef<Map<string, EdgePointsResponse>>(new Map());
  const loadGeneration = useRef(0);

  useEffect(() => {
    payloadCache.current.clear();
  }, [commit, includeZeroScore]);

  const filteredEdges = useMemo(
    () =>
      edges.filter(
        (edge) =>
          edge.source.includes(sourceFilter) &&
          edge.target.includes(targetFilter) &&
          edge.score >= minPoints,
      ),
    [edges, minPoints, sourceFilter, targetFilter],
  );

  useEffect(() => {
    if (!filteredEdges.length) {
      loadGeneration.current += 1;
      setCategoryRows([]);
      setLoading(false);
      setMissingCount(0);
      return;
    }
    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    setLoading(true);
    setLoadError(null);
    const pairRequests = filteredEdges.map((edge) => ({ source: edge.source, target: edge.target }));
    const chunks: { source: string; target: string }[][] = [];
    for (let index = 0; index < pairRequests.length; index += EDGE_POINTS_BATCH_SIZE) {
      chunks.push(pairRequests.slice(index, index + EDGE_POINTS_BATCH_SIZE));
    }
    Promise.all(chunks.map((chunk) => fetchEdgePointsBatch(chunk, commit, includeZeroScore)))
      .then((batches) => {
        if (generation !== loadGeneration.current) {
          return;
        }
        const batchEdges = batches.flatMap((batch) => batch.edges);
        const missing = batches.flatMap((batch) => batch.missing ?? []);
        setMissingCount(missing.length);
        const payloadByKey = new Map(
          batchEdges.map((payload) => [`${payload.source}->${payload.target}`, payload]),
        );
        for (const [key, payload] of payloadByKey) {
          payloadCache.current.set(key, payload);
        }
        const rows: CategoryRow[] = [];
        for (const edge of filteredEdges) {
          const payload = payloadByKey.get(`${edge.source}->${edge.target}`);
          if (!payload) {
            continue;
          }
          for (const point of payload.points) {
            rows.push({
              source: edge.source,
              target: edge.target,
              category: point.category,
              points: point.points,
              why: point.why_points || payload.why_points?.[point.category] || "—",
              total: payload.breakdown.total,
              evidenceKey: `${edge.source}->${edge.target}`,
            });
          }
        }
        setCategoryRows(rows);
      })
      .catch((err: Error) => {
        if (generation === loadGeneration.current) {
          setCategoryRows([]);
          setLoadError(err.message);
        }
      })
      .finally(() => {
        if (generation === loadGeneration.current) {
          setLoading(false);
        }
      });
  }, [commit, filteredEdges, includeZeroScore]);

  function toggleEvidence(key: string) {
    if (expandedEvidence === key) {
      setExpandedEvidence(null);
      setEvidenceRows([]);
      return;
    }
    const payload = payloadCache.current.get(key);
    setExpandedEvidence(key);
    setEvidenceRows(payload?.evidence ?? []);
  }

  return (
    <>
      <TextInput label="Source filter" value={sourceFilter} onChange={(e) => setSourceFilter(e.currentTarget.value)} mb="xs" />
      <TextInput label="Target filter" value={targetFilter} onChange={(e) => setTargetFilter(e.currentTarget.value)} mb="xs" />
      <NumberInput label="Min points" value={minPoints} onChange={(value) => setMinPoints(Number(value) || 0)} mb="sm" />
      <Text size="sm" mb="xs">
        Visible category rows: {categoryRows.length} | edges: {filteredEdges.length}
        {missingCount ? ` | missing pairs: ${missingCount}` : ""}
      </Text>
      {loading ? <Text size="sm" c="dimmed">Loading edge points…</Text> : null}
      {loadError ? <Text size="sm" c="red">{loadError}</Text> : null}
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Source</Table.Th>
            <Table.Th>Target</Table.Th>
            <Table.Th>Category</Table.Th>
            <Table.Th>Points</Table.Th>
            <Table.Th>Edge total</Table.Th>
            <Table.Th>Why</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {categoryRows.map((row) => {
            const key = `${row.evidenceKey}:${row.category}`;
            return (
              <Table.Tr
                key={key}
                onClick={() => toggleEvidence(row.evidenceKey)}
                style={{ cursor: "pointer" }}
              >
                <Table.Td>{row.source}</Table.Td>
                <Table.Td>{row.target}</Table.Td>
                <Table.Td>{row.category}</Table.Td>
                <Table.Td>{row.points}</Table.Td>
                <Table.Td>{row.total}</Table.Td>
                <Table.Td>{row.why}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      {expandedEvidence && evidenceRows.length ? (
        <Table mt="md" withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th colSpan={3}>Evidence for {expandedEvidence}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {evidenceRows.map((row, index) => (
              <Table.Tr key={`${row.kind}-${row.line}-${index}`}>
                <Table.Td colSpan={3}>
                  {row.kind} @ {row.file_path}:{row.line} — {row.detail}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : null}
    </>
  );
}
