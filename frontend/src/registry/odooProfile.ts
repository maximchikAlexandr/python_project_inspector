import { filter, map, pipe, sumBy } from "remeda";

import type { EdgeKind } from "../domain/domain";

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

export const LINE_CATEGORIES = [
  { key: "python_lines", label: "Python code" },
  { key: "js_lines", label: "JS" },
  { key: "python_test_lines", label: "Python test" },
  { key: "xml_lines", label: "XML view" },
  { key: "css_lines", label: "CSS" },
  { key: "html_lines", label: "HTML" },
] as const;

export const DEFAULT_LINE_CATEGORIES = ["python_lines", "js_lines"] as const;

export const NEUTRAL_NODE_RADIUS = 50;
export const MIN_NODE_RADIUS = 34;
export const MAX_NODE_RADIUS = 86;

export const BRIGHTNESS_CRITERIA = [
  { key: "cyclomatic_median", label: "Cyclomatic median", weight: 1.0 },
  { key: "cognitive_median", label: "Cognitive median", weight: 1.3 },
  { key: "jones_median", label: "Jones median", weight: 1.0 },
  { key: "method_count", label: "Method count", weight: 1.0 },
  { key: "code_lines", label: "Code lines", weight: 0.4 },
  { key: "python_file_count", label: "Python file count", weight: 1.0 },
] as const;

export const DEFAULT_BRIGHTNESS_CRITERIA: readonly BrightnessCriterion[] = map(
  BRIGHTNESS_CRITERIA,
  ({ key }) => key,
);

export const CHART_CATEGORY_COLORS = ["blue.6", "orange.6", "teal.6", "grape.6", "cyan.6", "pink.6"] as const;

export type GraphBreakdownKind = "model_reuse" | "extension_or_method" | "view" | "field_property";
export type GraphEdgeKind = GraphBreakdownKind;

export const GRAPH_BREAKDOWN_KINDS = [
  { key: "model_reuse", label: "Model reuse", color: "#2563eb" },
  { key: "extension_or_method", label: "Extension / method", color: "#ea580c" },
  { key: "view", label: "View", color: "#0d9488" },
  { key: "field_property", label: "Field / property", color: "#9333ea" },
] as const;

export const GRAPH_EDGE_KIND_KEYS: readonly GraphEdgeKind[] = GRAPH_BREAKDOWN_KINDS.map(({ key }) => key);

export function graphBreakdownKindMeta(edges: ReadonlyArray<{ readonly breakdown: Readonly<Record<string, number>> }>): readonly typeof GRAPH_BREAKDOWN_KINDS[number][] {
  const present = new Set<GraphBreakdownKind>();
  for (const edge of edges) {
    for (const { key } of GRAPH_BREAKDOWN_KINDS) {
      if ((edge.breakdown[key] ?? 0) > 0) {
        present.add(key);
      }
    }
  }
  return filter(GRAPH_BREAKDOWN_KINDS, ({ key }) => present.has(key));
}

export const EDGE_KIND_LABELS: Readonly<Record<EdgeKind, string>> = {
  python__inherit: "Model extension (_inherit)",
  python_method_call: "Method call",
  python_private_method_call: "Private method call",
  python_many2one: "Many2one field",
  python_one2many: "One2many field",
  python_many2many: "Many2many field",
  python_related: "Related field",
  python_api_depends: "@api.depends",
  python_api_onchange: "@api.onchange",
  python_api_constrains: "@api.constrains",
  python_env_model: "self.env['model'] access",
  python_field_property_access: "Field/property access",
  security_ir_rule_model_ref: "ir.rule model reference",
  security_ir_rule_ref: "ir.rule reference",
  security_xml_ref: "Security XML ref",
  security_csv_ref: "Security CSV ref",
  xml_inherit_id: "XML inherit_id",
  xml_ref: "XML ref",
  xml_percent_ref: "XML %(module.xml_id)d ref",
  manifest_depends: "Manifest depends",
};

const NON_SCORING_EDGE_KINDS = new Set<EdgeKind>([
  "manifest_depends",
  "security_ir_rule_ref",
  "security_xml_ref",
  "security_csv_ref",
]);

/** Whether a raw string is a known `EdgeKind` that counts towards the score. */
export function isScoringEdgeKind(kind: string): boolean {
  return kind in EDGE_KIND_LABELS && !NON_SCORING_EDGE_KINDS.has(kind as EdgeKind);
}

export function edgeKindLabel(kind: string): string {
  return (EDGE_KIND_LABELS as Readonly<Record<string, string>>)[kind] ?? kind;
}

export type BrightnessNode = {
  readonly module_name: string;
  readonly cyclomatic_median: number;
  readonly cognitive_median: number;
  readonly jones_median: number;
  readonly method_count: number;
  readonly python_file_count: number;
  readonly line_categories: Readonly<Record<string, number>>;
};

export function lineCategoryTotal(
  categories: Readonly<Record<string, number>>,
  active: ReadonlySet<LineCategoryKey>,
): number {
  if (!active.size) {
    return 0;
  }
  return sumBy([...active], (key) => categories[key] ?? 0);
}

function interpolateChannel(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio);
}

function interpolateRgb(
  start: { r: number; g: number; b: number },
  end: { r: number; g: number; b: number },
  ratio: number,
): string {
  const normalized = Math.max(0, Math.min(1, ratio));
  return `rgb(${interpolateChannel(start.r, end.r, normalized)}, ${interpolateChannel(start.g, end.g, normalized)}, ${interpolateChannel(start.b, end.b, normalized)})`;
}

export function colorForComplexityRatio(ratio: number): string {
  return interpolateRgb({ r: 207, g: 231, b: 228 }, { r: 15, g: 118, b: 110 }, ratio);
}

export function strokeForComplexityRatio(ratio: number): string {
  return interpolateRgb({ r: 107, g: 114, b: 128 }, { r: 17, g: 94, b: 89 }, ratio);
}

export function textColorForComplexityRatio(ratio: number): string {
  return ratio >= 0.45 ? "#ffffff" : "#111827";
}

export function normalizeValues(values: ReadonlyArray<number>): number[] {
  return pipe(values, (items) => {
    if (!items.length) {
      return [];
    }
    const min = Math.min(...items);
    const max = Math.max(...items);
    if (min === max) {
      return map(items, () => 0);
    }
    return map(items, (value) => (value - min) / (max - min));
  });
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
  nodes: ReadonlyArray<BrightnessNode>,
  active: ReadonlySet<BrightnessCriterion>,
): ReadonlyMap<string, number> {
  if (!active.size || !nodes.length) {
    return new Map();
  }
  const activeCriteria = filter(BRIGHTNESS_CRITERIA, ({ key }) => active.has(key));
  const normalizedByCriterion = map(activeCriteria, ({ key }) =>
    normalizeValues(map(nodes, (node) => graphNodeMetricValue(node, key))),
  );
  const weightSum = sumBy(activeCriteria, ({ weight }) => weight);
  return new Map(
    map(nodes, (node, index) => [
      node.module_name,
      sumBy(
        activeCriteria,
        ({ weight }, criterionIndex) => normalizedByCriterion[criterionIndex][index] * weight,
      ) / weightSum,
    ] as const),
  );
}

export type ModuleCouplingStats = {
  outgoing_edges: number;
  incoming_edges: number;
  private_calls: number;
};

export function moduleCouplingStats(
  moduleName: string,
  edges: ReadonlyArray<{ readonly source: string; readonly target: string; readonly kinds?: Readonly<Record<string, number>> }>,
): ModuleCouplingStats {
  const outgoing = filter(edges, (edge) => edge.source === moduleName);
  const incoming = filter(edges, (edge) => edge.target === moduleName);
  return {
    outgoing_edges: outgoing.length,
    incoming_edges: incoming.length,
    private_calls: sumBy(outgoing, (edge) => edge.kinds?.python_private_method_call ?? 0),
  };
}
