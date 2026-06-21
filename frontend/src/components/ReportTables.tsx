import { NumberInput, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchEdgePointsBatch,
  type EdgeRow,
  type FileSnapshot,
  type ModuleSnapshot,
} from "../api/client";
import {
  edgeKindLabel,
  LINE_CATEGORIES,
} from "../registry/odooProfile";
import { buildKindRows, type KindRow } from "../transforms/reportTransforms";
import { formatCodeLines } from "../utils/metricFormat";
import { EvidenceStack } from "./EvidenceStack";
import { MetricText } from "./MetricText";

const EDGE_POINTS_BATCH_SIZE = 500;

type Props = {
  modules: ModuleSnapshot[];
};

export function ModuleLinesTable({ modules }: Props) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(
    () =>
      [...modules]
        .filter((module) => module.module_name.includes(filter))
        .sort((left, right) => right.total_lines - left.total_lines || left.module_name.localeCompare(right.module_name)),
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
            <Table.Th>Cyclomatic</Table.Th>
            <Table.Th>Cognitive</Table.Th>
            <Table.Th>Jones nodes/line</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((module) => (
            <Table.Tr key={module.module_name}>
              <Table.Td>{module.module_name}</Table.Td>
              <Table.Td>{formatCodeLines(module.total_lines)}</Table.Td>
              {LINE_CATEGORIES.map(({ key }) => (
                <Table.Td key={key}>{formatCodeLines(module.line_categories[key] ?? 0)}</Table.Td>
              ))}
              <Table.Td>
                <MetricText dist={module.cyclomatic} />
              </Table.Td>
              <Table.Td>
                <MetricText dist={module.cognitive} />
              </Table.Td>
              <Table.Td>
                <MetricText dist={module.jones} />
              </Table.Td>
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
            <Table.Th>Cyclomatic</Table.Th>
            <Table.Th>Cognitive</Table.Th>
            <Table.Th>Jones nodes/line</Table.Th>
            <Table.Th>Parse error</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((file) => (
            <Table.Tr key={`${file.module_name}/${file.relative_path}`}>
              <Table.Td>{file.module_name}</Table.Td>
              <Table.Td>{file.relative_path}</Table.Td>
              <Table.Td>{formatCodeLines(file.lines)}</Table.Td>
              <Table.Td>{file.function_count}</Table.Td>
              <Table.Td>{file.jones_line_count}</Table.Td>
              <Table.Td>
                <MetricText dist={file.cyclomatic} />
              </Table.Td>
              <Table.Td>
                <MetricText dist={file.cognitive} />
              </Table.Td>
              <Table.Td>
                <MetricText dist={file.jones} />
              </Table.Td>
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
  moduleOptions,
}: {
  edges: EdgeRow[];
  commit: string;
  includeZeroScore: boolean;
  moduleOptions: string[];
}) {
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [targetFilter, setTargetFilter] = useState<string | null>(null);
  const [minPoints, setMinPoints] = useState(1);
  const [kindRows, setKindRows] = useState<KindRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingCount, setMissingCount] = useState(0);
  const loadGeneration = useRef(0);

  const edgeSignature = useMemo(
    () => edges.map((edge) => `${edge.source}|${edge.target}`).join(","),
    [edges],
  );

  const visibleRows = useMemo(
    () =>
      kindRows.filter((row) => {
        if (sourceFilter && row.source !== sourceFilter) {
          return false;
        }
        if (targetFilter && row.target !== targetFilter) {
          return false;
        }
        return row.points >= minPoints;
      }),
    [kindRows, minPoints, sourceFilter, targetFilter],
  );

  useEffect(() => {
    if (!edges.length) {
      loadGeneration.current += 1;
      setKindRows([]);
      setLoading(false);
      setMissingCount(0);
      return;
    }
    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    setLoading(true);
    setLoadError(null);
    setKindRows([]);
    setMissingCount(0);
    const pairRequests = edges.map((edge) => ({ source: edge.source, target: edge.target }));
    const chunks: { source: string; target: string }[][] = [];
    for (let index = 0; index < pairRequests.length; index += EDGE_POINTS_BATCH_SIZE) {
      chunks.push(pairRequests.slice(index, index + EDGE_POINTS_BATCH_SIZE));
    }
    (async () => {
      try {
        const allRows: KindRow[] = [];
        let missingTotal = 0;
        for (const chunk of chunks) {
          if (generation !== loadGeneration.current) {
            return;
          }
          const batch = await fetchEdgePointsBatch(chunk, commit, includeZeroScore);
          missingTotal += (batch.missing ?? []).length;
          for (const payload of batch.edges) {
            allRows.push(...buildKindRows(payload));
          }
        }
        if (generation !== loadGeneration.current) {
          return;
        }
        setMissingCount(missingTotal);
        setKindRows(allRows);
      } catch (err) {
        if (generation === loadGeneration.current) {
          setKindRows([]);
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (generation === loadGeneration.current) {
          setLoading(false);
        }
      }
    })();
  }, [commit, edgeSignature, edges.length, includeZeroScore]);

  const selectOptions = useMemo(
    () => moduleOptions.map((name) => ({ value: name, label: name })),
    [moduleOptions],
  );

  return (
    <>
      <Select
        label="Source module"
        placeholder="All modules"
        clearable
        data={selectOptions}
        value={sourceFilter}
        onChange={setSourceFilter}
        mb="xs"
      />
      <Select
        label="Target module"
        placeholder="All modules"
        clearable
        data={selectOptions}
        value={targetFilter}
        onChange={setTargetFilter}
        mb="xs"
      />
      <NumberInput label="Min graph points" min={0} value={minPoints} onChange={(value) => setMinPoints(Number(value) || 0)} mb="sm" />
      <Text size="sm" mb="xs">
        Visible kind rows: {visibleRows.length} / {kindRows.length}
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
            <Table.Th>Category points</Table.Th>
            <Table.Th>Edge total points</Table.Th>
            <Table.Th>Evidence</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visibleRows.map((row, index) => (
            <Table.Tr key={`${row.source}:${row.target}:${row.kind}:${index}`}>
              <Table.Td>{row.source}</Table.Td>
              <Table.Td>{row.target}</Table.Td>
              <Table.Td>
                <Stack gap={2}>
                  <Text size="xs" fw={700}>
                    {edgeKindLabel(row.kind)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {row.kind}
                  </Text>
                </Stack>
              </Table.Td>
              <Table.Td>{formatCodeLines(row.points)}</Table.Td>
              <Table.Td>{formatCodeLines(row.total)}</Table.Td>
              <Table.Td>
                <EvidenceStack evidence={row.evidence} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}
