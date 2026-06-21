import { Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";

import type { ModuleSnapshot } from "../api/client";
import { t } from "../i18n";
import {
  BRIGHTNESS_CRITERIA,
  type BrightnessCriterion,
  LINE_CATEGORIES,
  type LineCategoryKey,
  type ModuleCouplingStats,
} from "../registry/odooProfile";
import { formatCodeLines } from "../utils/metricFormat";
import { DistributionBlock } from "./DistributionBlock";

type Props = {
  module: ModuleSnapshot | null;
  brightnessCriteria: Set<BrightnessCriterion>;
  couplingStats?: ModuleCouplingStats | null;
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

export function ModuleDetailPanel({ module, brightnessCriteria, couplingStats }: Props) {
  if (!module) {
    return (
      <Paper withBorder radius="md" p="md" bg="#fbfcfd">
        <Text size="sm" c="dimmed">
          {t("moduleDetail.empty", "Click a module to inspect its line and complexity metrics.")}
        </Text>
      </Paper>
    );
  }
  const activeBrightnessLabels = BRIGHTNESS_CRITERIA.filter(({ key }) => brightnessCriteria.has(key)).map(
    ({ key, label }) => brightnessLabel(key, label),
  );
  return (
    <Paper withBorder radius="md" p="md" bg="#fbfcfd">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Title order={3} size="h4">
            {module.module_name}
          </Title>
          <Badge color="teal" variant="light">
            {activeBrightnessLabels.length
              ? activeBrightnessLabels.join(", ")
              : t("moduleDetail.noBrightnessCriteria", "No brightness criteria")}
          </Badge>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          <DistributionBlock label="Cyclomatic" dist={module.cyclomatic} />
          <DistributionBlock label="Cognitive" dist={module.cognitive} />
          <DistributionBlock label="Jones nodes/line" dist={module.jones} />
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              {t("moduleDetail.methodCount", "Method count")}
            </Text>
            <Text size="lg" fw={700}>
              {formatCodeLines(module.cyclomatic.count)}
            </Text>
            <Text size="xs" c="dimmed">
              {t("moduleDetail.methodCountHelp", "Functions/methods counted by cyclomatic analysis")}
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              {t("moduleDetail.codeLines", "Code lines")}
            </Text>
            <Text size="lg" fw={700}>
              {formatCodeLines(module.line_categories.python_lines ?? 0)}
            </Text>
            <Text size="xs" c="dimmed">
              {t("moduleDetail.codeLinesHelp", "Production Python lines only, tests excluded")}
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              {t("moduleDetail.pythonFileCount", "Python file count")}
            </Text>
            <Text size="lg" fw={700}>
              {formatCodeLines(module.python_file_count)}
            </Text>
            <Text size="xs" c="dimmed">
              {t("moduleDetail.pythonFileCountHelp", "Production Python files only, tests excluded")}
            </Text>
          </Stack>
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          <Text size="sm">
            {t("moduleDetail.totalLines", "Total lines: {{value}}", { value: formatCodeLines(module.total_lines) })}
          </Text>
          {LINE_CATEGORIES.map(({ key, label }) => (
            <Text key={key} size="sm">
              {lineCategoryLabel(key, label)}: {formatCodeLines(module.line_categories[key] ?? 0)}
            </Text>
          ))}
          <Text size="sm">{t("moduleDetail.scoreIn", "Score in: {{value}}", { value: module.score_in })}</Text>
          <Text size="sm">{t("moduleDetail.scoreOut", "Score out: {{value}}", { value: module.score_out })}</Text>
          {couplingStats ? (
            <>
              <Text size="sm">
                {t("moduleDetail.outgoingEdges", "Outgoing edges: {{value}}", {
                  value: couplingStats.outgoing_edges,
                })}
              </Text>
              <Text size="sm">
                {t("moduleDetail.incomingEdges", "Incoming edges: {{value}}", {
                  value: couplingStats.incoming_edges,
                })}
              </Text>
              <Text size="sm">
                {t("moduleDetail.privateCalls", "Private calls: {{value}}", {
                  value: couplingStats.private_calls,
                })}
              </Text>
            </>
          ) : null}
          <Text size="sm">
            {t("moduleDetail.parseErrors", "Parse errors: {{value}}", {
              value: module.python_complexity_parse_errors,
            })}
          </Text>
        </SimpleGrid>
        <Stack gap={4}>
          <Text size="sm">
            {t("moduleDetail.declaredModels", "Declared models: {{value}}", {
              value: module.declared_models.join(", ") || "—",
            })}
          </Text>
          <Text size="sm">
            {t("moduleDetail.inheritedModels", "Inherited models: {{value}}", {
              value: module.inherited_models.join(", ") || "—",
            })}
          </Text>
          {module.manifest_depends ? (
            <Text size="sm">
              {t("moduleDetail.manifestDepends", "Manifest depends: {{value}}", {
                value: module.manifest_depends.join(", ") || "—",
              })}
            </Text>
          ) : null}
        </Stack>
      </Stack>
    </Paper>
  );
}
