/**
 * Unit tests for tooltip view-model builders (PPI-028/042).
 */
import { describe, it, expect } from "vitest";

import type { GraphEdge, GraphNode } from "../api/client";
import { buildEdgeTooltip, buildNodeTooltip, buildTooltipModel, tooltipVariantFor, type TooltipModel, type TooltipVariant } from "./tooltipViewModel";

const breakdown = { model_reuse: 1, extension_or_method: 2, view: 3, field_property: 0, total: 6 };

describe("buildEdgeTooltip", () => {
  it("joins source/target and breakdown into a single string", () => {
    const edge: GraphEdge = { source: "a", target: "b", score: 5, breakdown };
    const tooltip = buildEdgeTooltip(edge);
    expect(tooltip).toContain("a -> b");
    expect(tooltip).toContain("points=6");
    expect(tooltip).toContain("reuse=1");
    expect(tooltip).toContain("view=3");
  });
});

describe("buildNodeTooltip", () => {
  it("joins node name and metrics into a single string", () => {
    const node: GraphNode = {
      module_name: "m",
      total_lines: 100,
      line_categories: { python_lines: 50 },
      metrics: {
        method_count: 7,
        cyclomatic_median: 4,
        cognitive_median: 9,
        jones_median: 2,
      },
    };
    const tooltip = buildNodeTooltip(node, 50);
    expect(tooltip).toContain("m");
    expect(tooltip).toContain("methods=7");
    expect(tooltip).toContain("CC med");
  });
});

describe("tooltipVariantFor", () => {
  it("returns 'none' for null/undefined", () => {
    expect(tooltipVariantFor(null)).toBe<TooltipVariant>("none");
    expect(tooltipVariantFor(undefined)).toBe<TooltipVariant>("none");
  });

  it("returns 'file' for an object with relative_path", () => {
    expect(tooltipVariantFor({ relative_path: "x.py" })).toBe<TooltipVariant>("file");
  });

  it("returns 'module' for an object with module_name and no breakdown", () => {
    expect(tooltipVariantFor({ module_name: "m" })).toBe<TooltipVariant>("module");
  });

  it("returns 'edge' for an object with breakdown", () => {
    expect(tooltipVariantFor({ breakdown })).toBe<TooltipVariant>("edge");
  });

  it("returns 'none' for primitives", () => {
    expect(tooltipVariantFor("x")).toBe<TooltipVariant>("none");
    expect(tooltipVariantFor(42)).toBe<TooltipVariant>("none");
  });
});

describe("buildTooltipModel", () => {
  it("returns {kind:'none'} for null", () => {
    expect(buildTooltipModel(null)).toEqual<TooltipModel>({ kind: "none" });
  });

  it("returns {kind:'file'} for an object with relative_path", () => {
    expect(buildTooltipModel({ relative_path: "x.py" })).toEqual<TooltipModel>({ kind: "file" });
  });

  it("returns {kind:'module'} with content for a node", () => {
    const node: GraphNode = { module_name: "m", total_lines: 100, line_categories: { python_lines: 50 }, metrics: { method_count: 7, cyclomatic_median: 4, cognitive_median: 9, jones_median: 2 } };
    const result = buildTooltipModel(node, 50);
    expect(result.kind).toBe("module");
    expect((result as Extract<TooltipModel, { kind: "module" }>).content).toContain("m");
  });

  it("returns {kind:'edge'} with content for an edge", () => {
    const edge: GraphEdge = { source: "a", target: "b", score: 5, breakdown };
    const result = buildTooltipModel(edge);
    expect(result.kind).toBe("edge");
    expect((result as Extract<TooltipModel, { kind: "edge" }>).content).toContain("a -> b");
  });
});