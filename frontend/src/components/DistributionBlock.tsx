import { Stack, Text } from "@mantine/core";

import type { MetricDistribution } from "../api/client";

type Props = {
  label: string;
  dist: MetricDistribution;
};

export function DistributionBlock({ label, dist }: Props) {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={600}>
        {label}
      </Text>
      <Text size="xs">
        count {dist.count}, mean {dist.mean.toFixed(2)}, median {dist.median.toFixed(2)}, p95 {dist.p95.toFixed(2)}, max{" "}
        {dist.max.toFixed(2)}
      </Text>
    </Stack>
  );
}
