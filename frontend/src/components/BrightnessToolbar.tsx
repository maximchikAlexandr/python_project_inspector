import { Checkbox, Group, Paper, Stack, Text } from "@mantine/core";

import { t } from "../i18n";
import { BRIGHTNESS_CRITERIA, type BrightnessCriterion } from "../registry/odooProfile";

type Props = {
  active: Set<BrightnessCriterion>;
  onChange: (next: Set<BrightnessCriterion>) => void;
};

function brightnessLabel(key: BrightnessCriterion, fallback: string): string {
  switch (key) {
    case "cyclomatic_median":
      return t("brightness.cyclomaticMedian", "Cyclomatic median");
    case "cognitive_median":
      return t("brightness.cognitiveMedian", "Cognitive median");
    case "jones_median":
      return t("brightness.jonesMedian", "Jones median");
    case "method_count":
      return t("brightness.methodCount", "Method count");
    case "code_lines":
      return t("brightness.codeLines", "Code lines");
    case "python_file_count":
      return t("brightness.pythonFileCount", "Python file count");
    default:
      return fallback;
  }
}

export function BrightnessToolbar({ active, onChange }: Props) {
  return (
    <Paper withBorder radius="md" p="sm" style={{ width: "100%" }}>
      <Stack gap="xs">
        <Text size="sm" fw={600} c="dimmed">
          {t("brightness.toolbarTitle", "Module brightness criteria")}
        </Text>
        <Checkbox.Group
          value={[...active]}
          onChange={(values) => onChange(new Set(values as BrightnessCriterion[]))}
        >
          <Group gap="md">
            {BRIGHTNESS_CRITERIA.map(({ key, label }) => (
              <Checkbox key={key} value={key} label={brightnessLabel(key, label)} />
            ))}
          </Group>
        </Checkbox.Group>
      </Stack>
    </Paper>
  );
}
