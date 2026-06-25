import { Code, Paper, Stack, Text } from "@mantine/core";

import type { EvidenceRow } from "../api/client";

type Props = {
  readonly evidence: readonly EvidenceRow[];
};

export function EvidenceStack({ evidence }: Props) {
  if (!evidence.length) {
    return <Text size="xs" c="dimmed">—</Text>;
  }
  return (
    <Stack gap="xs">
      {evidence.map((item, index) => (
        <Paper key={`${item.file_path}-${item.line}-${index}`} withBorder radius="sm" p="xs" bg="#fbfcfd">
          <Stack gap={4}>
            {item.source_quote ? <Code block>{item.source_quote}</Code> : null}
            <Text size="xs" c="dimmed">
              {item.file_path}:{item.line}
            </Text>
            <Text size="xs" c="dimmed">
              {item.detail}
            </Text>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
