/**
 * Pure tooltip view-model builders (PPI-028).
 *
 * Extracted from JSX components so tooltip construction is unit-testable and
 * does not run inside the render body.
 *
 * `buildTooltipModel` returns a discriminated {@link TooltipModel} so the
 * call-site can `switch` on `kind` without loose string checks.
 */

import type { GraphEdge, GraphNode } from "../api/client";
import { formatCodeLines, formatMetricValue } from "../utils/metricFormat";

/** Build the edge tooltip text (graph view). */
export function buildEdgeTooltip(edge: GraphEdge): string {
  const bd = edge.breakdown ?? {};
  const parts = [`${edge.source} -> ${edge.target}`, `points=${bd.total ?? 0}`];
  for (const [kind, value] of Object.entries(bd)) {
    if (kind !== "total" && value) {
      parts.push(`${kind}=${value}`);
    }
  }
  return parts.join(" | ");
}

/** Build the node tooltip text (graph view). */
export function buildNodeTooltip(
  node: GraphNode,
  visible: number,
  metricIds: readonly string[] = [],
): string {
  const m = node.metrics ?? {};
  const parts: string[] = [node.module_name, `visible=${formatCodeLines(visible)}`];
  for (const id of metricIds) {
    parts.push(`${id}=${formatMetricValue(m[id])}`);
  }
  return parts.join(" | ");
}

/** Tooltip variant chosen by a small mapping-table (PPI-028). */
export type TooltipVariant = "file" | "module" | "edge" | "none";

export function tooltipVariantFor(value: unknown): TooltipVariant {
  if (value === null || value === undefined) return "none";
  if (typeof value === "object" && value !== null) {
    if ("relative_path" in value) return "file";
    if ("module_name" in value && !("breakdown" in value)) return "module";
    if ("breakdown" in value) return "edge";
  }
  return "none";
}

export type TooltipModel =
  | { readonly kind: "none" }
  | { readonly kind: "file" }
  | { readonly kind: "module"; readonly content: string }
  | { readonly kind: "edge"; readonly content: string };

export function buildTooltipModel(input: unknown, visible?: number): TooltipModel {
  const kind = tooltipVariantFor(input);
  if (kind === "none" || kind === "file") return { kind };
  if (kind === "module") return { kind, content: buildNodeTooltip(input as GraphNode, visible ?? 0) };
  return { kind, content: buildEdgeTooltip(input as GraphEdge) };
}