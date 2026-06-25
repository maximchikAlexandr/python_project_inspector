import { Stack, Text } from "@mantine/core";

import type { MetricDistribution } from "../api/client";
import { formatMetricValue, formatStatsLine } from "../utils/metricFormat";

type Props = {
  readonly label: string;
  readonly dist: MetricDistribution;
};

export function DistributionBlock({ label, dist }: Props) {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={700}>
        {label}
      </Text>
      <Text size="sm">{dist.count ? `avg ${formatMetricValue(dist.mean)}` : "-"}</Text>
      <Text size="xs" c="dimmed">
        {formatStatsLine(dist)}
      </Text>
    </Stack>
  );
}
