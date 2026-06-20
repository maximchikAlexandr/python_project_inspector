import { Checkbox, Group, Text } from "@mantine/core";

import { LINE_CATEGORIES, type LineCategoryKey } from "../registry/odooProfile";

type Props = {
  active: Set<LineCategoryKey>;
  onChange: (next: Set<LineCategoryKey>) => void;
};

export function LineCategoryToolbar({ active, onChange }: Props) {
  return (
    <Group gap="xs" wrap="wrap">
      <Text size="sm" fw={600}>
        Line categories:
      </Text>
      {LINE_CATEGORIES.map(({ key, label }) => (
        <Checkbox
          key={key}
          label={label}
          checked={active.has(key)}
          onChange={(event) => {
            const next = new Set(active);
            if (event.currentTarget.checked) {
              next.add(key);
            } else {
              next.delete(key);
            }
            onChange(next);
          }}
        />
      ))}
    </Group>
  );
}
