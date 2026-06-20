export type LineCategoryKey =
  | "python_lines"
  | "js_lines"
  | "python_test_lines"
  | "xml_lines"
  | "css_lines"
  | "html_lines";

export type BrightnessCriterion =
  | "cyclomatic_median"
  | "cognitive_median"
  | "jones_median"
  | "method_count"
  | "code_lines"
  | "python_file_count";

export const LINE_CATEGORIES: { key: LineCategoryKey; label: string }[] = [
  { key: "python_lines", label: "Python code" },
  { key: "js_lines", label: "JS" },
  { key: "python_test_lines", label: "Python test" },
  { key: "xml_lines", label: "XML view" },
  { key: "css_lines", label: "CSS" },
  { key: "html_lines", label: "HTML" },
];

export const BRIGHTNESS_CRITERIA: { key: BrightnessCriterion; label: string }[] = [
  { key: "cyclomatic_median", label: "Cyclomatic median" },
  { key: "cognitive_median", label: "Cognitive median" },
  { key: "jones_median", label: "Jones median" },
  { key: "method_count", label: "Method count" },
  { key: "code_lines", label: "Code lines" },
  { key: "python_file_count", label: "Python file count" },
];

export type BrightnessNode = {
  module_name: string;
  cyclomatic_median: number;
  cognitive_median: number;
  jones_median: number;
  method_count: number;
  python_file_count: number;
  line_categories: Record<string, number>;
};

export function lineCategoryTotal(
  categories: Record<string, number>,
  active: Set<LineCategoryKey>,
): number {
  if (!active.size) {
    return Object.values(categories).reduce((sum, value) => sum + value, 0);
  }
  return [...active].reduce((sum, key) => sum + (categories[key] ?? 0), 0);
}

export function normalizeValues(values: number[]): number[] {
  if (!values.length) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return values.map(() => 0);
  }
  return values.map((value) => (value - min) / (max - min));
}

export function graphNodeMetricValue(node: BrightnessNode, criterion: BrightnessCriterion): number {
  if (criterion === "code_lines") {
    return node.line_categories.python_lines ?? 0;
  }
  if (criterion === "method_count") {
    return node.method_count;
  }
  if (criterion === "python_file_count") {
    return node.python_file_count;
  }
  return node[criterion];
}

export function computeNodeBrightnessMap(
  nodes: BrightnessNode[],
  active: Set<BrightnessCriterion>,
): Map<string, number> {
  if (!active.size || !nodes.length) {
    return new Map();
  }
  const criteria = [...active];
  const normalizedByCriterion = criteria.map((criterion) =>
    normalizeValues(nodes.map((node) => graphNodeMetricValue(node, criterion))),
  );
  const result = new Map<string, number>();
  nodes.forEach((node, index) => {
    const brightness =
      normalizedByCriterion.reduce((sum, normalized) => sum + normalized[index], 0) / criteria.length;
    result.set(node.module_name, brightness);
  });
  return result;
}
