import { Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";

import type { ModuleSnapshot } from "../api/client";
import { DistributionBlock } from "./DistributionBlock";

type Props = {
  module: ModuleSnapshot | null;
};

export function ModuleDetailPanel({ module }: Props) {
  if (!module) {
    return <Text c="dimmed">Select a module to view details.</Text>;
  }
  return (
    <Paper withBorder p="md">
      <Title order={5} mb="sm">
        {module.module_name}
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
        <Text size="sm">Total lines: {module.total_lines}</Text>
        <Text size="sm">Python code lines: {module.line_categories.python_lines}</Text>
        <Text size="sm">Python files: {module.python_file_count}</Text>
        <Text size="sm">Method count: {module.cyclomatic.count}</Text>
        <Text size="sm">Parse errors: {module.python_complexity_parse_errors}</Text>
        <Text size="sm">Score in: {module.score_in}</Text>
        <Text size="sm">Score out: {module.score_out}</Text>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 3 }} mt="md">
        <DistributionBlock label="Cyclomatic" dist={module.cyclomatic} />
        <DistributionBlock label="Cognitive" dist={module.cognitive} />
        <DistributionBlock label="Jones" dist={module.jones} />
      </SimpleGrid>
      <Stack gap={4} mt="sm">
        <Text size="sm">Declared models: {module.declared_models.join(", ") || "—"}</Text>
        <Text size="sm">Inherited models: {module.inherited_models.join(", ") || "—"}</Text>
        {module.manifest_depends ? (
          <Text size="sm">Manifest depends: {module.manifest_depends.join(", ") || "—"}</Text>
        ) : null}
      </Stack>
    </Paper>
  );
}
