/**
 * Unit tests for typed domain enums, ParseFailure value object and zod
 * boundary schemas (PPI-039/040/022/030/034).
 */
import { describe, it, expect } from "vitest";

import {
  edgeKindOf,
  graphBreakdownKindOf,
  lineCategoryOf,
  GraphResponseSchema,
  SnapshotModulesResponseSchema,
  StatusResponseSchema,
} from "../api/schemas";
import {
  formatParseFailure,
  parseFailure,
  parseFailureFromRow,
  type ParseFailure,
} from "./domain";

describe("edgeKindOf", () => {
  it("returns the typed kind for a known string", () => {
    expect(edgeKindOf("python_method_call")).toBe("python_method_call");
    expect(edgeKindOf("manifest_depends")).toBe("manifest_depends");
  });

  it("returns null for an unknown string", () => {
    expect(edgeKindOf("not_a_kind")).toBeNull();
    expect(edgeKindOf(123)).toBeNull();
  });
});

describe("graphBreakdownKindOf", () => {
  it("returns the typed group for a known string", () => {
    expect(graphBreakdownKindOf("model_reuse")).toBe("model_reuse");
  });

  it("returns null for an unknown string", () => {
    expect(graphBreakdownKindOf("nope")).toBeNull();
  });
});

describe("lineCategoryOf", () => {
  it("returns the typed category for a known string", () => {
    expect(lineCategoryOf("python_lines")).toBe("python_lines");
    expect(lineCategoryOf("html_lines")).toBe("html_lines");
  });

  it("returns null for an unknown string", () => {
    expect(lineCategoryOf("ruby_lines")).toBeNull();
  });
});

describe("parseFailure", () => {
  it("builds a ParseFailure with defaults for optional fields", () => {
    const failure = parseFailure({ kind: "python_syntax", path: "m/x.py", message: "boom", origin: "python" });
    expect(failure.line).toBeNull();
    expect(failure.column).toBeNull();
    expect(failure.kind).toBe("python_syntax");
  });

  it("preserves provided line/column", () => {
    const failure = parseFailure({
      kind: "python_syntax",
      path: "m/x.py",
      message: "boom",
      origin: "python",
      line: 42,
      column: 7,
    });
    expect(failure.line).toBe(42);
    expect(failure.column).toBe(7);
  });
});

describe("formatParseFailure", () => {
  it("includes path, line, kind and message", () => {
    const failure: ParseFailure = {
      kind: "python_syntax",
      path: "m/x.py",
      line: 10,
      column: 2,
      message: "unexpected token",
      origin: "python",
    };
    expect(formatParseFailure(failure)).toBe("m/x.py:10:2 [python_syntax]: unexpected token");
  });

  it("omits location when line is null", () => {
    const failure: ParseFailure = {
      kind: "unknown",
      path: "m/x",
      line: null,
      column: null,
      message: "oops",
      origin: "unknown",
    };
    expect(formatParseFailure(failure)).toBe("m/x [unknown]: oops");
  });
});

describe("parseFailureFromRow", () => {
  it("lifts a flat FailureRow into a typed ParseFailure", () => {
    const failure = parseFailureFromRow({
      commit_hash: "abc",
      file_path: "addons/m/x.py",
      error_text: "SyntaxError: invalid",
    });
    expect(failure.path).toBe("addons/m/x.py");
    expect(failure.message).toBe("SyntaxError: invalid");
    expect(failure.origin).toBe("python");
    expect(failure.kind).toBe("unknown");
  });

  it("falls back to (unknown) path when file_path is null", () => {
    const failure = parseFailureFromRow({ commit_hash: null, file_path: null, error_text: "x" });
    expect(failure.path).toBe("(unknown)");
  });

  it("infers xml origin from .xml extension", () => {
    expect(parseFailureFromRow({ commit_hash: null, file_path: "v.xml", error_text: "x" }).origin).toBe("xml");
  });
});

describe("StatusResponseSchema", () => {
  it("accepts a well-formed status payload", () => {
    const parsed = StatusResponseSchema.safeParse({
      project_id: "p",
      branch: "main",
      schema_version: 1,
      expected_schema_version: 1,
      schema_compatible: true,
      store_present: true,
      writer_active: false,
      commit_count: 3,
      last_run: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a payload missing a required field", () => {
    const parsed = StatusResponseSchema.safeParse({ project_id: "p" });
    expect(parsed.success).toBe(false);
  });
});

describe("GraphResponseSchema", () => {
  it("accepts a graph payload with nodes and edges", () => {
    const parsed = GraphResponseSchema.safeParse({
      commit_hash: "h",
      nodes: [
        {
          module_name: "m",
          total_lines: 1,
          line_categories: { python_lines: 1 },
          python_file_count: 1,
          method_count: 0,
          cyclomatic_median: 0,
          cognitive_median: 0,
          jones_median: 0,
          score_in: 0,
          score_out: 0,
        },
      ],
      edges: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a graph payload with a malformed node", () => {
    const parsed = GraphResponseSchema.safeParse({
      commit_hash: "h",
      nodes: [{ module_name: "m" }],
      edges: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("SnapshotModulesResponseSchema", () => {
  it("accepts a modules snapshot payload", () => {
    const parsed = SnapshotModulesResponseSchema.safeParse({
      commit_hash: "h",
      modules: [
        {
          module_name: "m",
          total_lines: 1,
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
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a modules payload missing distribution fields", () => {
    const parsed = SnapshotModulesResponseSchema.safeParse({
      commit_hash: "h",
      modules: [{ module_name: "m" }],
    });
    expect(parsed.success).toBe(false);
  });
});