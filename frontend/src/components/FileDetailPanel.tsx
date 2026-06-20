import { Paper, SimpleGrid, Text, Title } from "@mantine/core";

import type { FileSnapshot } from "../api/client";
import { DistributionBlock } from "./DistributionBlock";

type Props = {
  file: FileSnapshot | null;
};

export function FileDetailPanel({ file }: Props) {
  if (!file) {
    return <Text c="dimmed">Select a file to view details.</Text>;
  }
  return (
    <Paper withBorder p="md">
      <Title order={5} mb="sm">
        {file.module_name}/{file.relative_path}
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
        <Text size="sm">Top folder: {file.top_folder}</Text>
        <Text size="sm">Category: {file.category}</Text>
        <Text size="sm">Lines: {file.lines}</Text>
        <Text size="sm">Functions: {file.function_count}</Text>
        <Text size="sm">AST lines: {file.jones_line_count}</Text>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 3 }} mt="md">
        <DistributionBlock label="Cyclomatic" dist={file.cyclomatic} />
        <DistributionBlock label="Cognitive" dist={file.cognitive} />
        <DistributionBlock label="Jones" dist={file.jones} />
      </SimpleGrid>
      {file.parse_error ? (
        <Text size="sm" c="red" mt="sm">
          Parse error: {file.parse_error}
        </Text>
      ) : null}
    </Paper>
  );
}
