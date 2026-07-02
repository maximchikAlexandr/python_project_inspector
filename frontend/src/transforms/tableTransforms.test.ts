import { describe, it, expect } from "vitest";

import type { GenericTableRow } from "../api/client";
import { deriveLineCountColumns, lineCountCellValue } from "./tableTransforms";

function row(cells: Record<string, unknown>): GenericTableRow {
  return { cells };
}

describe("deriveLineCountColumns", () => {
  it("returns columns only for non-empty line-count fields across all rows", () => {
    const rows = [
      row({ line_counts: { python_lines: 10, test_lines: 0 } }),
      row({ line_counts: { python_lines: 20, css_lines: 5 } }),
    ];
    const cols = deriveLineCountColumns(rows);
    expect(cols.map((c) => c.key)).toEqual(["css_lines", "python_lines"]);
  });

  it("returns empty array when no row has line_counts", () => {
    expect(deriveLineCountColumns([row({}), row({})])).toEqual([]);
  });

  it("uses provided labels when present", () => {
    const rows = [row({ line_counts: { python_lines: 10 } })];
    const cols = deriveLineCountColumns(rows, { python_lines: "Python" });
    expect(cols[0].label).toBe("Python");
  });

  it("humanizes key as label fallback", () => {
    const rows = [row({ line_counts: { python_lines: 10 } })];
    const cols = deriveLineCountColumns(rows);
    expect(cols[0].label).toBe("python");
  });

  it("skips null/undefined/non-finite numeric values", () => {
    const rows = [
      row({ line_counts: { python_lines: null } }),
      row({ line_counts: { python_lines: undefined } }),
    ];
    expect(deriveLineCountColumns(rows)).toEqual([]);
  });
});

describe("lineCountCellValue", () => {
  it("returns numeric value when present", () => {
    expect(lineCountCellValue(row({ line_counts: { python_lines: 42 } }), "python_lines")).toBe(42);
  });

  it("returns dash for missing or empty", () => {
    expect(lineCountCellValue(row({}), "python_lines")).toBe("—");
    expect(lineCountCellValue(row({ line_counts: {} }), "python_lines")).toBe("—");
  });
});
