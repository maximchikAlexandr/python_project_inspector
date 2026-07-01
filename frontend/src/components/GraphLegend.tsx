import { Group, Stack, Text } from "@mantine/core";

import { t } from "../i18n";
import type { UiMetricOption } from "../api/client";
import type { GraphDisplayState } from "./graphSettingsTypes";
type Props = {
  readonly nodeSizeMetric: GraphDisplayState["nodeSizeMetric"];
  readonly linkThicknessMetric: GraphDisplayState["linkThicknessMetric"];
  readonly edgeKindMeta: ReadonlyArray<{ key: string; label: string; color: string }>;
  readonly nodeSizeOptions?: readonly UiMetricOption[];
  readonly linkThicknessOptions?: readonly UiMetricOption[];
};

function findLabel(options: readonly UiMetricOption[] | undefined, id: string, fallback: string): string {
  return options?.find((o) => o.id === id)?.label ?? fallback;
}

export function GraphLegend({
  nodeSizeMetric,
  linkThicknessMetric,
  edgeKindMeta,
  nodeSizeOptions,
  linkThicknessOptions,
}: Props) {
  const nodeSizeLabelText = findLabel(nodeSizeOptions, nodeSizeMetric, nodeSizeMetric);
  const linkThicknessLabelText = findLabel(linkThicknessOptions, linkThicknessMetric, linkThicknessMetric);
  return (
    <Stack gap={6} mt="xs">
      <Text size="xs" fw={600}>
        {t("graph.legend.title", "Legend")}
      </Text>
      <Text size="xs" c="dimmed">
        {t("graph.legend.nodeSize", "Node size: {{value}}", {
          value: nodeSizeLabelText,
        })}
      </Text>
      <Text size="xs" c="dimmed">
        {t("graph.legend.nodeColor", "Node color: complexity brightness (toolbar)")}
      </Text>
      <Text size="xs" c="dimmed">
        {t("graph.legend.edgeThickness", "Edge thickness: {{value}}", {
          value: linkThicknessLabelText,
        })}
      </Text>
      {edgeKindMeta.map(({ key, label, color }) => (
        <Group key={key} gap={6}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: color,
              display: "inline-block",
            }}
          />
          <Text size="xs" c="dimmed">
            {label}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
