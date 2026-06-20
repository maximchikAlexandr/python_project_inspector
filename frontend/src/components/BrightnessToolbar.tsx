import { Checkbox, Group, Text } from "@mantine/core";

import { BRIGHTNESS_CRITERIA, type BrightnessCriterion } from "../registry/odooProfile";

type Props = {
  active: Set<BrightnessCriterion>;
  onChange: (next: Set<BrightnessCriterion>) => void;
};

export function BrightnessToolbar({ active, onChange }: Props) {
  return (
    <Group gap="xs" wrap="wrap">
      <Text size="sm" fw={600}>
        Brightness:
      </Text>
      {BRIGHTNESS_CRITERIA.map(({ key, label }) => (
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
