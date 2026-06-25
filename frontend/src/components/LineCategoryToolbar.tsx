import { Checkbox, Group, Paper, Stack, Text } from "@mantine/core";

import { t } from "../i18n";
import { LINE_CATEGORIES, type LineCategoryKey } from "../registry/odooProfile";

type Props = {
  readonly active: ReadonlySet<LineCategoryKey>;
  readonly onChange: (next: Set<LineCategoryKey>) => void;
};

function lineCategoryLabel(key: LineCategoryKey, fallback: string): string {
  switch (key) {
    case "python_lines":
      return t("lineCategory.pythonCode", "Python code");
    case "js_lines":
      return t("lineCategory.js", "JS");
    case "python_test_lines":
      return t("lineCategory.pythonTest", "Python test");
    case "xml_lines":
      return t("lineCategory.xmlView", "XML view");
    case "css_lines":
      return t("lineCategory.css", "CSS");
    case "html_lines":
      return t("lineCategory.html", "HTML");
    default:
      return fallback;
  }
}

export function LineCategoryToolbar({ active, onChange }: Props) {
  return (
    <Paper withBorder radius="md" p="sm" style={{ width: "100%" }}>
      <Stack gap="xs">
        <Text size="sm" fw={600} c="dimmed">
          {t("lineCategory.toolbarTitle", "Lines displayed inside node")}
        </Text>
        <Checkbox.Group
          value={[...active]}
          onChange={(values) => onChange(new Set(values as LineCategoryKey[]))}
        >
          <Group gap="md">
            {LINE_CATEGORIES.map(({ key, label }) => (
              <Checkbox key={key} value={key} label={lineCategoryLabel(key, label)} />
            ))}
          </Group>
        </Checkbox.Group>
      </Stack>
    </Paper>
  );
}
