import { Checkbox, Group, Paper, Stack, Text } from "@mantine/core";

import { t } from "../i18n";
import type { UiOption } from "../api/client";

type Props = {
  readonly options: readonly UiOption[];
  readonly active: ReadonlySet<string>;
  readonly onChange: (next: Set<string>) => void;
};

export function LineCategoryToolbar({ options, active, onChange }: Props) {
  return (
    <Paper withBorder radius="md" p="sm" style={{ width: "100%" }}>
      <Stack gap="xs">
        <Text size="sm" fw={600} c="dimmed">
          {t("lineCategory.toolbarTitle", "Lines displayed inside node")}
        </Text>
        <Checkbox.Group
          value={[...active]}
          onChange={(values) => onChange(new Set(values))}
        >
          <Group gap="md">
            {options.length === 0 && <Text size="xs" c="dimmed">No line categories</Text>}
            {options.map(({ id, label }) => (
              <Checkbox key={id} value={id} label={label} />
            ))}
          </Group>
        </Checkbox.Group>
      </Stack>
    </Paper>
  );
}
