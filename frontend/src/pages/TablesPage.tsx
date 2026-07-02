import { Button, Group, Loader, Paper, Select, Stack, Table, Text, Title } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchCommits,
  fetchSnapshotRelations,
  fetchSnapshotTableFiles,
  fetchSnapshotTableModules,
  fetchUiConfig,
  type CommitRow,
  type GenericTableResponse,
  type RelationsResponse,
  type UiConfigResponse,
} from "../api/client";
import { t } from "../i18n";
import { useAppNavigation } from "../navigation";
import { toCommitSelectOptions } from "../transforms/commitOptions";
import { deriveLineCountColumns, lineCountCellValue } from "../transforms/tableTransforms";
import { LoadingPanel } from "../components/LoadingPanel";

export function TablesPage() {
  const { selectedCommit, setSelectedCommit } = useAppNavigation();
  const [commits, setCommits] = useState<readonly CommitRow[]>([]);
  const [modulesTable, setModulesTable] = useState<GenericTableResponse | null>(null);
  const [relationsData, setRelationsData] = useState<RelationsResponse | null>(null);
  const [filesTable, setFilesTable] = useState<GenericTableResponse | null>(null);
  const [uiConfig, setUiConfig] = useState<UiConfigResponse | null>(null);
  const [loadingCommits, setLoadingCommits] = useState(true);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const modulesGeneration = useRef(0);
  const relationsGeneration = useRef(0);
  const filesGeneration = useRef(0);

  const commitOptions = useMemo(() => toCommitSelectOptions(commits), [commits]);
  const knownModuleNames = useMemo(
    () => new Set((modulesTable?.rows ?? []).map((row) => String(row.cells.module_name ?? ""))),
    [modulesTable],
  );

  useEffect(() => {
    fetchUiConfig().then(setUiConfig).catch(() => setUiConfig(null));
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
  }, [setSelectedCommit]);

  useEffect(() => {
    if (!selectedCommit) return;
    const generation = modulesGeneration.current + 1;
    modulesGeneration.current = generation;
    const relationsGen = relationsGeneration.current + 1;
    relationsGeneration.current = relationsGen;
    setModulesTable(null);
    setRelationsData(null);
    setSelectedModule(null);
    setLoadingSnapshot(true);
    setError(null);
    Promise.all([
      fetchSnapshotTableModules(selectedCommit),
      fetchSnapshotRelations(selectedCommit),
    ])
      .then(([modules, relations]) => {
        if (generation === modulesGeneration.current) setModulesTable(modules);
        if (relationsGen === relationsGeneration.current) setRelationsData(relations);
      })
      .catch((err: Error) => {
        if (generation === modulesGeneration.current) setError(err.message);
      })
      .finally(() => {
        if (generation === modulesGeneration.current) setLoadingSnapshot(false);
      });
  }, [selectedCommit]);

  useEffect(() => {
    if (!selectedCommit || !selectedModule) {
      setFilesTable(null);
      return;
    }
    if (!knownModuleNames.has(selectedModule)) {
      setSelectedModule(null);
      return;
    }
    const generation = filesGeneration.current + 1;
    filesGeneration.current = generation;
    setLoadingFiles(true);
    fetchSnapshotTableFiles(selectedCommit, selectedModule)
      .then((files) => {
        if (generation === filesGeneration.current) setFilesTable(files);
      })
      .catch((err: Error) => {
        if (generation === filesGeneration.current) setError(err.message);
      })
      .finally(() => {
        if (generation === filesGeneration.current) setLoadingFiles(false);
      });
  }, [selectedCommit, selectedModule, knownModuleNames]);

  const modulesConfig = uiConfig?.tables.find((tbl) => tbl.key === "modules");
  const relationsConfig = uiConfig?.tables.find((tbl) => tbl.key === "relations");
  const lineCountColumns = useMemo(
    () => (modulesTable ? deriveLineCountColumns(modulesTable.rows) : []),
    [modulesTable],
  );
  const nonLineCountColumns = useMemo(
    () => (modulesConfig?.columns ?? []).filter((c) => c.key !== "line_counts"),
    [modulesConfig],
  );
  const relationsColumns = useMemo(
    () => (relationsConfig?.columns ?? []).filter((c) => c.key !== "relation_type_id"),
    [relationsConfig],
  );

  return (
    <Stack gap="md">
      <Title order={3}>{t("tables.title", "Tables")}</Title>
      {error ? <Text c="red">{error}</Text> : null}
      <Group align="flex-end" wrap="wrap">
        <Select
          label={t("common.commit", "Commit")}
          data={commitOptions}
          value={selectedCommit}
          onChange={setSelectedCommit}
          searchable
          w={420}
          disabled={loadingCommits}
          rightSection={loadingCommits ? <Loader size="xs" /> : undefined}
        />
      </Group>

      <Paper withBorder radius="md" p="md">
        <Title order={4} mb="xs">
          {t("tables.moduleLines.dynamic", "Module line counts")}
        </Title>
        {loadingSnapshot ? (
          <LoadingPanel label={t("snapshot.loading.moduleLines", "Loading module lines...")} />
        ) : modulesTable ? (
          <div style={{ overflowX: "auto" }}>
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                {nonLineCountColumns.map((col) => (
                  <Table.Th key={col.key}>{col.label}</Table.Th>
                ))}
                {lineCountColumns.map((col) => (
                  <Table.Th key={col.key}>{col.label}</Table.Th>
                ))}
                <Table.Th>{t("common.module", "Module")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {modulesTable.rows.map((row, index) => {
                const moduleName = String(row.cells.module_name ?? index);
                const isSelected = selectedModule === moduleName;
                return (
                  <Table.Tr
                    key={`${moduleName}-${index}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedModule(isSelected ? null : moduleName)}
                  >
                    {nonLineCountColumns.map((col) => (
                      <Table.Td key={col.key}>
                        {String(row.cells[col.key] ?? "—")}
                      </Table.Td>
                    ))}
                    {lineCountColumns.map((col) => (
                      <Table.Td key={col.key}>{String(lineCountCellValue(row, col.key))}</Table.Td>
                    ))}
                    <Table.Td>
                      <Button
                        variant={isSelected ? "filled" : "subtle"}
                        size="xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedModule(isSelected ? null : moduleName);
                        }}
                      >
                        {isSelected ? "✓" : "→"}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          </div>
        ) : null}
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Title order={4} mb="xs">
          {selectedModule
            ? t("tables.drilldown.files", "Files in {{module}}", { module: selectedModule })
            : t("snapshot.moduleFileMap", "Module file map")}
        </Title>
        {selectedModule ? (
          loadingFiles ? (
            <LoadingPanel label={t("snapshot.loading.moduleFiles", "Loading module files...")} />
          ) : filesTable ? (
            <div style={{ overflowX: "auto" }}>
            <Table striped highlightOnHover withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("common.file", "File")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filesTable.rows.map((row, index) => (
                  <Table.Tr key={`${row.cells.relative_path ?? index}`}>
                    <Table.Td>{String(row.cells.relative_path ?? "—")}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            </div>
          ) : null
        ) : (
          <Text size="sm" c="dimmed">
            {t("tables.noFile", "Pick a module to inspect its files.")}
          </Text>
        )}
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Title order={4} mb="xs">
          {t("tables.relations.title", "Relations")}
        </Title>
        {loadingSnapshot ? (
          <LoadingPanel label={t("snapshot.loading.relations", "Loading relations...")} />
        ) : relationsData ? (
          <div style={{ overflowX: "auto" }}>
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                {relationsColumns.map((col) => (
                  <Table.Th key={col.key}>{col.label}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {relationsData.relations.map((row, index) => (
                <Table.Tr
                  key={`${row.source_id}-${row.target_id}-${row.relation_type_id}-${index}`}
                >
                  {relationsColumns.map((col) => (
                    <Table.Td key={col.key}>{String(row[col.key as keyof typeof row] ?? "—")}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </div>
        ) : (
          <Text c="dimmed">{t("tables.empty.relations", "No relations at this commit.")}</Text>
        )}
      </Paper>
    </Stack>
  );
}
