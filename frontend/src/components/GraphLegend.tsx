import { Group, Stack, Text } from "@mantine/core";

import { t } from "../i18n";
import type { GraphDisplayState } from "./graphSettingsTypes";
type Props = {
  readonly nodeSizeMetric: GraphDisplayState["nodeSizeMetric"];
  readonly linkThicknessMetric: GraphDisplayState["linkThicknessMetric"];
  readonly edgeKindMeta: ReadonlyArray<{ key: string; label: string; color: string }>;
};

const NODE_SIZE_LABELS: Record<string, string> = {
  visible_lines: "Visible line categories",
  total_lines: "Total lines",
  method_count: "Method count",
  score_in: "Incoming score",
  score_out: "Outgoing score",
  fixed: "Fixed radius",
};

function nodeSizeLabel(metric: string): string {
  switch (metric) {
    case "visible_lines":
      return t("graph.legend.nodeSize.visibleLineCategories", "Visible line categories");
    case "total_lines":
      return t("graph.legend.nodeSize.totalLines", "Total lines");
    case "method_count":
      return t("graph.legend.nodeSize.methodCount", "Method count");
    case "score_in":
      return t("graph.legend.nodeSize.incomingScore", "Incoming score");
    case "score_out":
      return t("graph.legend.nodeSize.outgoingScore", "Outgoing score");
    case "fixed":
      return t("graph.legend.nodeSize.fixedRadius", "Fixed radius");
    default:
      return NODE_SIZE_LABELS[metric] ?? metric;
  }
}

const LINK_THICKNESS_LABELS: Record<string, string> = {
  total_points: "Total edge points",
  selected_kind_points: "Selected-kind points",
  score: "Edge score",
  fixed: "Fixed thickness",
};

function linkThicknessLabel(metric: string): string {
  switch (metric) {
    case "total_points":
      return t("graph.legend.linkThickness.totalEdgePoints", "Total edge points");
    case "selected_kind_points":
      return t("graph.legend.linkThickness.selectedKindPoints", "Selected-kind points");
    case "score":
      return t("graph.legend.linkThickness.edgeScore", "Edge score");
    case "fixed":
      return t("graph.legend.linkThickness.fixedThickness", "Fixed thickness");
    default:
      return LINK_THICKNESS_LABELS[metric] ?? metric;
  }
}

export function GraphLegend({ nodeSizeMetric, linkThicknessMetric, edgeKindMeta }: Props) {
  return (
    <Stack gap={6} mt="xs">
      <Text size="xs" fw={600}>
        {t("graph.legend.title", "Legend")}
      </Text>
      <Text size="xs" c="dimmed">
        {t("graph.legend.nodeSize", "Node size: {{value}}", {
          value: nodeSizeLabel(nodeSizeMetric),
        })}
      </Text>
      <Text size="xs" c="dimmed">
        {t("graph.legend.nodeColor", "Node color: complexity brightness (toolbar)")}
      </Text>
      <Text size="xs" c="dimmed">
        {t("graph.legend.edgeThickness", "Edge thickness: {{value}}", {
          value: linkThicknessLabel(linkThicknessMetric),
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
