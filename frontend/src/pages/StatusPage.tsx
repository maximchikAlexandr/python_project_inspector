import {
  Alert,
  Badge,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";

import { fetchStatus, type StatusResponse } from "../api/client";

export function StatusPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus()
      .then(setStatus)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return <Alert color="red" title="Failed to load status">{error}</Alert>;
  }

  if (!status) {
    return <Text>Loading status…</Text>;
  }

  return (
    <Stack gap="md">
      <Title order={3}>Analysis status</Title>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Project
          </Text>
          <Text fw={600}>{status.project_id ?? "—"}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Branch
          </Text>
          <Text fw={600}>{status.branch ?? "—"}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Schema version
          </Text>
          <Text fw={600}>{status.schema_version}</Text>
          <Text size="xs" c="dimmed">
            Expected: {status.expected_schema_version}
          </Text>
          {!status.schema_compatible ? (
            <Badge color="red" mt="xs">
              Incompatible — re-run analyze with --rebuild
            </Badge>
          ) : null}
        </Paper>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Commits stored
          </Text>
          <Text fw={600}>{status.commit_count}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Store
          </Text>
          <Badge color={status.store_present ? "green" : "gray"}>
            {status.store_present ? "present" : "missing"}
          </Badge>
        </Paper>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Writer
          </Text>
          <Badge color={status.writer_active ? "yellow" : "green"}>
            {status.writer_active ? "active" : "idle"}
          </Badge>
        </Paper>
      </SimpleGrid>
      {status.last_run ? (
        <Paper withBorder p="md">
          <Title order={4} mb="sm">
            Last run
          </Title>
          <Group gap="lg">
            <Text size="sm">Mode: {status.last_run.mode}</Text>
            <Text size="sm">Status: {status.last_run.status}</Text>
            <Text size="sm">
              Commits: {status.last_run.commits_succeeded}/{status.last_run.commits_total}
            </Text>
            {status.last_run.commits_failed ? (
              <Text size="sm" c="red">
                Failed: {status.last_run.commits_failed}
              </Text>
            ) : null}
          </Group>
        </Paper>
      ) : (
        <Text c="dimmed">No analysis runs recorded yet.</Text>
      )}
    </Stack>
  );
}
