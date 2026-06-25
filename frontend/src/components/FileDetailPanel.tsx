import { Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";

import type { FileSnapshot } from "../api/client";
import { formatCodeLines } from "../utils/metricFormat";
import { DistributionBlock } from "./DistributionBlock";

type Props = {
  readonly file: FileSnapshot | null;
};

export function FileDetailPanel({ file }: Props) {
  if (!file) {
    return (
      <Paper withBorder radius="md" p="md" bg="#fbfcfd">
        <Text size="sm" c="dimmed">
          Select a file on the treemap to inspect its complexity metrics.
        </Text>
      </Paper>
    );
  }
  return (
    <Paper withBorder radius="md" p="md" bg="#fbfcfd">
      <Stack gap="sm">
        <Title order={3} size="h4">
          {file.module_name}/{file.relative_path}
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Functions
            </Text>
            <Text size="lg" fw={700}>
              {String(file.function_count || 0)}
            </Text>
            <Text size="xs" c="dimmed">
              Cyclomatic function count
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              AST lines
            </Text>
            <Text size="lg" fw={700}>
              {String(file.jones_line_count || 0)}
            </Text>
            <Text size="xs" c="dimmed">
              Jones AST measured lines
            </Text>
          </Stack>
          <DistributionBlock label="Cyclomatic" dist={file.cyclomatic} />
          <DistributionBlock label="Cognitive" dist={file.cognitive} />
          <DistributionBlock label="Jones nodes/line" dist={file.jones} />
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Parse error
            </Text>
            <Text size="lg" fw={700}>
              {file.parse_error ? "yes" : "no"}
            </Text>
            <Text size="xs" c="dimmed">
              {file.parse_error || "—"}
            </Text>
          </Stack>
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Text size="sm">Top folder: {file.top_folder}</Text>
          <Text size="sm">Category: {file.category}</Text>
          <Text size="sm">Lines: {formatCodeLines(file.lines)}</Text>
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
