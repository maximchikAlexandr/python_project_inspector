/**
 * Unit tests for pure transforms/selectors (PPI-027/042).
 *
 * Inputs are readonly; the helpers must not mutate them. Each test builds a
 * synthetic input and checks the derived output, including immutability of
 * the input.
 */
import { describe, it, expect } from "vitest";

import type {
  CommitRow,
  EdgeRow,
  EdgePointsResponse,
  FileSnapshot,
  GraphEdge,
  GraphNode,
  ModuleSnapshot,
  StructurePoint,
} from "../api/client";
import { GRAPH_EDGE_KIND_KEYS } from "../registry/odooProfile";
import { sortModuleLinesRows, filterFileRows } from "../components/tableViewModels";
import { buildKindRows } from "./reportTransforms";
import {
  graphEdgesToRows,
  moduleOptionsFromModules,
  commitPositionLabel,
  resolveGraphSelection,
  visibleLinesTotal,
} from "./snapshotTransforms";
import {
  structureChartRows,
  moduleSelectOptions,
  edgeKindSelectOptions,
  filterStructureEdges,
  formatEdgeKindsCell,
  pickDefaultStructureCommit,
} from "./structureTransforms";
import { buildComplexityDiff, edgeKindChartFromPoints, fileCountSeriesFromTimeseries, moduleSelectOptions as analyticsModuleOptions } from "./analyticsTransforms";
import { toCommitSelectOptions, toCommitSelectOptionsShort } from "./commitOptions";

function commit(order: number, hash: string, summary: string | null = null): CommitRow {
  return { commit_order: order, commit_hash: hash, authored_at: null, summary };
}

function module(name: string, total: number, extra: Partial<ModuleSnapshot> = {}): ModuleSnapshot {
  return {
    module_name: name,
    total_lines: total,
    line_categories: {},
    python_file_count: 0,
    cyclomatic: { count: 0, mean: 0, median: 0, p95: 0, max: 0 },
    cognitive: { count: 0, mean: 0, median: 0, p95: 0, max: 0 },
    jones: { count: 0, mean: 0, median: 0, p95: 0, max: 0 },
    declared_models: [],
    inherited_models: [],
    score_in: 0,
    score_out: 0,
    python_complexity_parse_errors: 0,
    ...extra,
  };
}

function file(name: string, path: string, lines: number, category = "python_lines"): FileSnapshot {
  return {
    module_name: name,
    relative_path: path,
    top_folder: path.split("/")[0],
    category,
    lines,
    function_count: 0,
    jones_line_count: 0,
    cyclomatic: { count: 0, mean: 0, median: 0, p95: 0, max: 0 },
    cognitive: { count: 0, mean: 0, median: 0, p95: 0, max: 0 },
    jones: { count: 0, mean: 0, median: 0, p95: 0, max: 0 },
    parse_error: null,
  };
}

const breakdown = { model_reuse: 1, extension_or_method: 2, view: 0, field_property: 0, total: 3 };

function edge(source: string, target: string, score: number, kinds: Record<string, number> = {}): GraphEdge {
  return { source, target, score, breakdown, kinds, kind_occurrence_count: 1, evidence_count: 1 };
}

describe("sortModuleLinesRows", () => {
  it("sorts by descending total lines then name", () => {
    const input: readonly ModuleSnapshot[] = [
      module("b", 10),
      module("a", 50),
      module("c", 50),
    ];
    const rows = sortModuleLinesRows(input, "");
    expect(rows.map((r) => r.module_name)).toEqual(["a", "c", "b"]);
  });

  it("filters by substring", () => {
    const input: readonly ModuleSnapshot[] = [module("alpha", 10), module("beta", 20)];
    expect(sortModuleLinesRows(input, "al").map((r) => r.module_name)).toEqual(["alpha"]);
  });

  it("does not mutate the input array order", () => {
    const input: readonly ModuleSnapshot[] = [module("b", 10), module("a", 50)];
    const snapshot = [...input].map((m) => m.module_name);
    sortModuleLinesRows(input, "");
    expect([...input].map((m) => m.module_name)).toEqual(snapshot);
  });
});

describe("filterFileRows", () => {
  it("filters by module and path substring", () => {
    const files: readonly FileSnapshot[] = [
      file("m1", "a/x.py", 10),
      file("m1", "b/y.py", 20),
      file("m2", "a/z.py", 30),
    ];
    expect(filterFileRows(files, "m1", "a").map((f) => f.relative_path)).toEqual(["a/x.py"]);
  });
});

describe("buildKindRows", () => {
  it("keeps only scoring kinds with points > 0", () => {
    const payload: EdgePointsResponse = {
      commit_hash: "h",
      source: "a",
      target: "b",
      breakdown,
      kinds: { python_method_call: 2, manifest_depends: 1 },
      points: [],
      evidence: [],
    };
    const rows = buildKindRows(payload);
    expect(rows.map((r) => r.kind)).toEqual(["python_method_call"]);
    expect(rows[0].points).toBe(2);
  });
});

describe("graphEdgesToRows", () => {
  it("carries the commit hash fallback", () => {
    const edges: readonly GraphEdge[] = [edge("a", "b", 5)];
    const rows = graphEdgesToRows(edges, "hash1");
    expect(rows[0].commit_hash).toBe("hash1");
  });

  it("does not mutate input", () => {
    const edges: readonly GraphEdge[] = [edge("a", "b", 5)];
    const before = edges[0];
    graphEdgesToRows(edges, "h");
    expect(edges[0]).toBe(before);
  });
});

describe("moduleOptionsFromModules", () => {
  it("returns sorted unique module names", () => {
    const modules: readonly ModuleSnapshot[] = [module("b", 1), module("a", 2), module("b", 3)];
    expect(moduleOptionsFromModules(modules)).toEqual(["a", "b"]);
  });
});

describe("commitPositionLabel", () => {
  it("shows position, order and hash for a known commit", () => {
    const commits: readonly CommitRow[] = [commit(1, "aaa"), commit(2, "bbb", "Fix")];
    expect(commitPositionLabel(commits, "bbb")).toContain("2 / 2");
    expect(commitPositionLabel(commits, "bbb")).toContain("Fix");
  });

  it("returns dash for null or unknown", () => {
    const commits: readonly CommitRow[] = [commit(1, "aaa")];
    expect(commitPositionLabel(commits, null)).toBe("—");
    expect(commitPositionLabel(commits, "zzz")).toBe("—");
  });
});

describe("resolveGraphSelection", () => {
  it("keeps focus when the module is present", () => {
    const nodes: readonly GraphNode[] = [{ module_name: "m", total_lines: 1, line_categories: {}, python_file_count: 0, method_count: 0, cyclomatic_median: 0, cognitive_median: 0, jones_median: 0, score_in: 0, score_out: 0 }];
    expect(resolveGraphSelection(nodes, "m").clearFocus).toBe(false);
  });

  it("clears focus when the module is missing", () => {
    const nodes: readonly GraphNode[] = [{ module_name: "m", total_lines: 1, line_categories: {}, python_file_count: 0, method_count: 0, cyclomatic_median: 0, cognitive_median: 0, jones_median: 0, score_in: 0, score_out: 0 }];
    const result = resolveGraphSelection(nodes, "missing");
    expect(result.clearFocus).toBe(true);
    expect(result.notice).toContain("missing");
  });
});

describe("visibleLinesTotal", () => {
  it("sums line category totals across modules", () => {
    const modules: readonly ModuleSnapshot[] = [
      module("a", 0, { line_categories: { python_lines: 10, js_lines: 5 } }),
      module("b", 0, { line_categories: { python_lines: 7 } }),
    ];
    expect(visibleLinesTotal(modules, new Set(["python_lines"]))).toBe(17);
    expect(visibleLinesTotal(modules, new Set(["python_lines", "js_lines"]))).toBe(22);
    expect(visibleLinesTotal(modules, new Set())).toBe(0);
  });
});

describe("structureChartRows", () => {
  it("maps points to chart rows", () => {
    const points: readonly StructurePoint[] = [
      { commit_order: 1, commit_hash: "a", edge_count: 2, total_score: 4 },
      { commit_order: 2, commit_hash: "b", edge_count: 3, total_score: 9 },
    ];
    expect(structureChartRows(points)).toEqual([
      { order: 1, edge_count: 2, total_score: 4 },
      { order: 2, edge_count: 3, total_score: 9 },
    ]);
  });
});

describe("moduleSelectOptions (structure)", () => {
  it("collects unique sorted source/target names", () => {
    const edges: readonly EdgeRow[] = [
      { source: "b", target: "a", score: 1, kinds: {}, commit_hash: "h" },
      { source: "a", target: "c", score: 1, kinds: {}, commit_hash: "h" },
    ];
    expect(moduleSelectOptions(edges).map((o) => o.value)).toEqual(["a", "b", "c"]);
  });
});

describe("edgeKindSelectOptions", () => {
  it("collects kinds with count > 0", () => {
    const edges: readonly EdgeRow[] = [
      { source: "a", target: "b", score: 1, kinds: { python_method_call: 2, view: 0 }, commit_hash: "h" },
      { source: "a", target: "c", score: 1, kinds: { manifest_depends: 1 }, commit_hash: "h" },
    ];
    const values = edgeKindSelectOptions(edges).map((o) => o.value);
    expect(values).toEqual(["manifest_depends", "python_method_call"]);
  });
});

describe("filterStructureEdges", () => {
  const edges: readonly EdgeRow[] = [
    { source: "a", target: "b", score: 5, kinds: { python_method_call: 2 }, commit_hash: "h" },
    { source: "a", target: "c", score: 1, kinds: { view: 1 }, commit_hash: "h" },
    { source: "b", target: "c", score: 3, kinds: {}, commit_hash: "h" },
  ];

  it("filters by source", () => {
    expect(filterStructureEdges(edges, { sourceFilter: "a", targetFilter: null, kindFilter: null, minScore: 0 }).length).toBe(2);
  });

  it("filters by min score", () => {
    expect(filterStructureEdges(edges, { sourceFilter: null, targetFilter: null, kindFilter: null, minScore: 3 }).length).toBe(2);
  });

  it("filters by kind", () => {
    expect(filterStructureEdges(edges, { sourceFilter: null, targetFilter: null, kindFilter: "view", minScore: 0 }).length).toBe(1);
  });
});

describe("formatEdgeKindsCell", () => {
  it("joins kind labels with counts and falls back to dash", () => {
    const e: EdgeRow = { source: "a", target: "b", score: 1, kinds: { python_method_call: 2 }, commit_hash: "h" };
    expect(formatEdgeKindsCell(e)).toContain("Method call (2)");
    expect(formatEdgeKindsCell({ source: "a", target: "b", score: 1, kinds: {}, commit_hash: "h" })).toBe("—");
  });
});

describe("pickDefaultStructureCommit", () => {
  it("keeps the current commit when it is present", () => {
    const points: readonly StructurePoint[] = [{ commit_order: 1, commit_hash: "a", edge_count: 1, total_score: 1 }];
    expect(pickDefaultStructureCommit(points, [], "a")).toBe("a");
  });

  it("falls back to the last commit with edges", () => {
    const points: readonly StructurePoint[] = [
      { commit_order: 1, commit_hash: "empty", edge_count: 0, total_score: 0 },
      { commit_order: 2, commit_hash: "real", edge_count: 3, total_score: 5 },
    ];
    expect(pickDefaultStructureCommit(points, [], null)).toBe("real");
  });

  it("falls back to the last commit when no points have edges", () => {
    const points: readonly StructurePoint[] = [{ commit_order: 1, commit_hash: "a", edge_count: 0, total_score: 0 }];
    expect(pickDefaultStructureCommit(points, [commit(9, "fallback")], null)).toBe("fallback");
  });
});

describe("buildComplexityDiff", () => {
  it("joins modules present in both snapshots and sorts by cyclomatic delta", () => {
    const a: readonly ModuleSnapshot[] = [
      module("m1", 0, { cyclomatic: { count: 1, mean: 1, median: 2, p95: 0, max: 0 } }),
      module("m2", 0, { cyclomatic: { count: 1, mean: 1, median: 5, p95: 0, max: 0 } }),
    ];
    const b: readonly ModuleSnapshot[] = [
      module("m1", 0, { cyclomatic: { count: 1, mean: 1, median: 5, p95: 0, max: 0 } }),
      module("m2", 0, { cyclomatic: { count: 1, mean: 1, median: 5, p95: 0, max: 0 } }),
      module("m3", 0, { cyclomatic: { count: 1, mean: 1, median: 9, p95: 0, max: 0 } }),
    ];
    const rows = buildComplexityDiff(a, b);
    expect(rows.map((r) => r.module_name)).toEqual(["m1", "m2"]);
    expect(rows[0].cyclomatic_b - rows[0].cyclomatic_a).toBe(3);
    expect(rows[1].cyclomatic_b - rows[1].cyclomatic_a).toBe(0);
  });
});

describe("edgeKindChartFromPoints", () => {
  it("builds chart rows and series indexed by commit order", () => {
    const rows = edgeKindChartFromPoints([
      { commit_order: 1, commit_hash: "a", kind: "view", value: 2 },
      { commit_order: 1, commit_hash: "a", kind: "model_reuse", value: 1 },
      { commit_order: 2, commit_hash: "b", kind: "view", value: 4 },
    ]);
    expect(rows.chartRows.length).toBe(2);
    expect(rows.series.map((s) => s.name).sort()).toEqual(["model_reuse", "view"]);
  });
});

describe("fileCountSeriesFromTimeseries", () => {
  it("returns an empty array when the series has no points", () => {
    expect(fileCountSeriesFromTimeseries({ level: "module", metric: "python_file_count", agg: "mean", series: [] })).toEqual([]);
  });

  it("maps the first series points to {order, value}", () => {
    const out = fileCountSeriesFromTimeseries({
      level: "module",
      metric: "python_file_count",
      agg: "mean",
      series: [{ name: "python_file_count", points: [{ commit_order: 1, commit_hash: "a", value: 3 }, { commit_order: 2, commit_hash: "b", value: null }] }],
    });
    expect(out).toEqual([{ order: 1, value: 3 }, { order: 2, value: 0 }]);
  });
});

describe("analyticsModuleOptions", () => {
  it("maps names to {value,label}", () => {
    expect(analyticsModuleOptions(["a", "b"])).toEqual([
      { value: "a", label: "a" },
      { value: "b", label: "b" },
    ]);
  });
});

describe("toCommitSelectOptions", () => {
  it("builds long labels with summary", () => {
    const options = toCommitSelectOptions([commit(1, "abcdef1234", "Fix bug")]);
    expect(options[0].value).toBe("abcdef1234");
    expect(options[0].label).toContain("Fix bug");
  });
});

describe("toCommitSelectOptionsShort", () => {
  it("builds short labels without summary", () => {
    const options = toCommitSelectOptionsShort([commit(1, "abcdef1234", "ignored")]);
    expect(options[0].label).not.toContain("ignored");
    expect(options[0].label).toContain("#1");
  });
});