import type { GenericTableRow } from "../api/client";

export type LineCountColumn = {
  readonly key: string;
  readonly label: string;
};

function isDisplayable(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  return true;
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function humanizeKey(key: string): string {
  if (key.endsWith("_lines")) {
    return key.slice(0, -"_lines".length).replace(/_/g, " ");
  }
  return key.replace(/_/g, " ");
}

export function deriveLineCountColumns(
  rows: readonly GenericTableRow[],
  labels: Readonly<Record<string, string>> = {},
): LineCountColumn[] {
  const present: Record<string, number> = {};
  for (const row of rows) {
    const cell = row.cells["line_counts"];
    if (!isStringRecord(cell)) continue;
    for (const [key, value] of Object.entries(cell)) {
      if (!isDisplayable(value)) continue;
      present[key] = (present[key] ?? 0) + 1;
    }
  }
  return Object.keys(present)
    .sort()
    .map((key) => ({
      key,
      label: labels[key] ?? humanizeKey(key),
    }));
}

export function lineCountCellValue(row: GenericTableRow, key: string): number | string {
  const cell = row.cells["line_counts"];
  if (!isStringRecord(cell)) return "—";
  const value = cell[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return "—";
}
