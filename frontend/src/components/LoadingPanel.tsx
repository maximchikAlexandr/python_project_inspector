import { Center, Loader, Paper, Stack, Text } from "@mantine/core";

export function LoadingPanel({ label }: { label: string }) {
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
