import { Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";

import type { UiMetricOption, UiOption } from "../api/client";
import { t } from "../i18n";
import { formatCodeLines } from "../utils/metricFormat";

type Props = {
  readonly module: Record<string, unknown> | null;
  readonly brightnessCriteria: ReadonlySet<string>;
  readonly metricOptions: readonly UiMetricOption[];
  readonly lineCategoryOptions: readonly UiOption[];
};

export function ModuleDetailPanel({ module, brightnessCriteria, metricOptions, lineCategoryOptions }: Props) {
  if (!module) {
    return (
      <Paper withBorder radius="md" p="md" bg="#fbfcfd">
        <Text size="sm" c="dimmed">
          {t("moduleDetail.empty", "Click a module to inspect its metrics.")}
        </Text>
      </Paper>
    );
  }
  const metrics = (module.metrics ?? {}) as Record<string, number>;
  const lineCounts = (module.line_counts ?? {}) as Record<string, number>;
  const activeMetrics = metricOptions.filter((o) => brightnessCriteria.has(o.id));
  const name = String(module.module_name ?? "");

  return (
    <Paper withBorder radius="md" p="md" bg="#fbfcfd">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Title order={3} size="h4">
            {name}
          </Title>
          <Badge color="teal" variant="light">
            {activeMetrics.length
              ? activeMetrics.map((m) => m.label).join(", ")
              : t("moduleDetail.noBrightnessCriteria", "No brightness criteria")}
          </Badge>
        </Group>
        {activeMetrics.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {activeMetrics.map((opt) => (
              <Stack key={opt.id} gap={4}>
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                  {opt.label}
                </Text>
                <Text size="lg" fw={700}>
                  {formatCodeLines(metrics[opt.id] ?? 0)}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        )}
        {lineCategoryOptions.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {lineCategoryOptions.map((opt) => (
              <Text key={opt.id} size="sm">
                {opt.label}: {formatCodeLines(lineCounts[opt.id] ?? 0)}
              </Text>
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Paper>
  );
}