/**
 * Unit tests for pure graph selectors (PPI-027/042).
 *
 * Inputs are readonly; selectors must not mutate them.
 */
import { describe, it, expect } from "vitest";

import type { GraphEdge, GraphNode } from "../api/client";

import type { GraphFilterState } from "./graphSettingsTypes";
import {
  applyGraphFilters,
  buildGraphEdgeViews,
  computeEdgeVisibleScore,
  computeLocalGraph,
  maxEffectiveEdgeScore,
  maxNodeMetric,
} from "./graphSelectors";

const breakdown = { model_reuse: 1, extension_or_method: 2, view: 0, field_property: 0, total: 3 };

function node(name: string, lines = 10): GraphNode {
  return {
    module_name: name,
    total_lines: lines,
    line_counts: { python_lines: lines },
    metrics: {
      python_file_count: 1,
      method_count: 0,
      cyclomatic_median: 0,
      cognitive_median: 0,
      jones_median: 0,
      score_in: 0,
      score_out: 0,
    },
  };
}

function edge(source: string, target: string, score: number, reuse = 1, ext = 0): GraphEdge {
  return {
    source,
    target,
    score,
    breakdown: { model_reuse: reuse, extension_or_method: ext, view: 0, field_property: 0, total: reuse + ext },
    kinds: {},
  };
}

const BREAKDOWN_KINDS = ["model_reuse", "extension_or_method", "view", "field_property"];
const ALL_KINDS: Readonly<Record<string, boolean>> = Object.fromEntries(
  BREAKDOWN_KINDS.map((k) => [k, true]),
);

const FILTER: GraphFilterState = {
  enabledEdgeKinds: ALL_KINDS,
  minEdgeScore: 0,
  includeZeroScore: true,
  focusEnabled: false,
  focusModule: null,
  localDepth: 1,
  directionMode: "both",
};

describe("computeEdgeVisibleScore", () => {
  it("sums enabled kind breakdowns", () => {
    expect(computeEdgeVisibleScore(edge("a", "b", 5, 2, 3), ALL_KINDS)).toBe(5);
  });

  it("ignores disabled kinds", () => {
    const none: Readonly<Record<string, boolean>> = Object.fromEntries(
      BREAKDOWN_KINDS.map((k) => [k, false]),
    );
    expect(computeEdgeVisibleScore(edge("a", "b", 5, 2, 3), none)).toBe(0);
  });
});

describe("applyGraphFilters", () => {
  it("returns noKindsSelected when all kinds disabled", () => {
    const none: Readonly<Record<string, boolean>> = Object.fromEntries(
      BREAKDOWN_KINDS.map((k) => [k, false]),
    );
    const result = applyGraphFilters([node("a")], [edge("a", "b", 1)], { ...FILTER, enabledEdgeKinds: none });
    expect(result.noKindsSelected).toBe(true);
    expect(result.edges).toEqual([]);
  });

  it("filters edges below min score", () => {
    const result = applyGraphFilters([node("a"), node("b")], [edge("a", "b", 0, 0, 0), edge("a", "b", 5, 5, 0)], {
      ...FILTER,
      minEdgeScore: 3,
    });
    expect(result.edges.length).toBe(1);
    expect(result.stats.visibleEdges).toBe(1);
  });

  it("does not mutate input edges", () => {
    const edges: readonly GraphEdge[] = [edge("a", "b", 5, 2, 3)];
    const before = edges[0];
    applyGraphFilters([node("a"), node("b")], edges, FILTER);
    expect(edges[0]).toBe(before);
  });
});

describe("computeLocalGraph", () => {
  it("returns full graph when no focus module", () => {
    const nodes: readonly GraphNode[] = [node("a"), node("b")];
    const edges: readonly GraphEdge[] = [edge("a", "b", 1)];
    expect(computeLocalGraph(nodes, edges, null, 1, "both").nodes.length).toBe(2);
  });

  it("returns no neighbors match when focus module is missing", () => {
    const result = computeLocalGraph([node("a")], [edge("a", "b", 1)], "missing", 1, "both");
    expect(result.nodes).toEqual([]);
  });

  it("limits to depth 1 neighbors", () => {
    const nodes: readonly GraphNode[] = [node("a"), node("b"), node("c"), node("d")];
    const edges: readonly GraphEdge[] = [edge("a", "b", 1), edge("b", "c", 1), edge("c", "d", 1)];
    const result = computeLocalGraph(nodes, edges, "a", 1, "both");
    expect(result.nodes.map((n) => n.module_name).sort()).toEqual(["a", "b"]);
  });
});

describe("maxEffectiveEdgeScore", () => {
  it("returns 0 for an empty edge list", () => {
    expect(maxEffectiveEdgeScore([], ALL_KINDS)).toBe(0);
  });

  it("returns the max visible score", () => {
    const edges: readonly GraphEdge[] = [edge("a", "b", 1, 1, 0), edge("c", "d", 9, 9, 0)];
    expect(maxEffectiveEdgeScore(edges, ALL_KINDS)).toBe(9);
  });
});

describe("maxNodeMetric", () => {
  it("returns 1 when there are no nodes", () => {
    expect(maxNodeMetric([], "total_lines", new Set())).toBe(1);
  });

  it("computes the max total_lines", () => {
    const nodes: readonly GraphNode[] = [node("a", 5), node("b", 20)];
    expect(maxNodeMetric(nodes, "total_lines", new Set())).toBe(20);
  });
});

describe("buildGraphEdgeViews", () => {
  it("offsets bidirectional edges so they don't overlap", () => {
    const edges: readonly GraphEdge[] = [edge("a", "b", 1), edge("b", "a", 1)];
    const views = buildGraphEdgeViews(edges, { linkThicknessMetric: "total_points" } as never, ALL_KINDS, 18);
    const offsets = views.map((v) => v.offset).sort((x, y) => x - y);
    expect(offsets).toEqual([-18, 18]);
  });
});