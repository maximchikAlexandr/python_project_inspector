import { LineChart } from "@mantine/charts";
import { Paper, Text, Title } from "@mantine/core";

import type { TimeseriesPoint } from "../api/client";

type MetricChartProps = {
  readonly title: string;
  readonly points: readonly TimeseriesPoint[];
  readonly yLabel: string;
};

export function MetricChart({ title, points, yLabel }: MetricChartProps) {
  const data = points.map((point) => ({
    order: point.commit_order,
    value: point.value ?? 0,
    hash: point.commit_hash.slice(0, 8),
  }));

  if (!data.length) {
    return (
      <Paper withBorder p="md">
        <Title order={4}>{title}</Title>
        <Text c="dimmed" mt="sm">
          No data for this selection.
        </Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="md">
      <Title order={4} mb="md">
        {title}
      </Title>
      <LineChart
        h={320}
        data={data}
        dataKey="order"
        series={[{ name: "value", label: yLabel, color: "blue.6" }]}
        curveType="monotone"
        withLegend
        withTooltip
        tooltipProps={{
          content: ({ label, payload }) => {
            const row = payload?.[0]?.payload as { hash?: string; value?: number } | undefined;
            return (
              <Paper p="xs" withBorder shadow="sm">
                <Text size="xs">Commit #{label}</Text>
                <Text size="xs">{row?.hash ?? ""}</Text>
                <Text size="sm" fw={600}>
                  {yLabel}: {row?.value ?? "—"}
                </Text>
              </Paper>
            );
          },
        }}
      />
    </Paper>
  );
}
