import { sumBy } from "remeda";

export const NEUTRAL_NODE_RADIUS = 50;
export const MIN_NODE_RADIUS = 34;
export const MAX_NODE_RADIUS = 86;

export const CHART_CATEGORY_COLORS = ["blue.6", "orange.6", "teal.6", "grape.6", "cyan.6", "pink.6"] as const;

export function lineCategoryTotal(
  categories: Readonly<Record<string, number>>,
  active: ReadonlySet<string>,
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
