import { Paper, Stack, Text } from "@mantine/core";

import { t } from "../i18n";
import { formatCodeLines } from "../utils/metricFormat";

type Props = {
  total: number;
  selectedLabels: string[];
  loading?: boolean;
};

export function VisibleLinesSummary({ total, selectedLabels, loading = false }: Props) {
  return (
    <Paper withBorder radius="md" p="md" bg="#fbfcfd">
      <Stack gap={4}>
        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
          {t("snapshot.visibleLines.title", "Visible code lines")}
        </Text>
        <Text size="xl" fw={700}>
          {loading ? "…" : formatCodeLines(total)}
        </Text>
        <Text size="xs" c="dimmed">
          {selectedLabels.length
            ? t("snapshot.visibleLines.selectedCategories", "Selected categories: {{categories}}", {
                categories: selectedLabels.join(", "),
              })
            : t("snapshot.visibleLines.noCategories", "No line categories selected.")}
        </Text>
      </Stack>
    </Paper>
  );
}
