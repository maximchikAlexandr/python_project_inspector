/**
 * Unit tests for typed domain enums, ParseFailure value object and zod
 * boundary schemas (PPI-039/040/022/030/034).
 */
import { describe, it, expect } from "vitest";

import { GraphResponseSchema } from "../api/schemas";
import {
  formatParseFailure,
  parseFailure,
  parseFailureFromRow,
  type ParseFailure,
} from "./domain";

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