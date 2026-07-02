import { describe, it, expect } from "vitest";

import { formatCommitDate, COMMIT_DATE_FORMAT } from "./commitDate";

describe("formatCommitDate", () => {
  it("uses YYYY-MM-DD HH:mm format", () => {
    expect(COMMIT_DATE_FORMAT).toBe("YYYY-MM-DD HH:mm");
  });

  it("formats a fixed UTC timestamp into local YYYY-MM-DD HH:mm", () => {
    const date = new Date(2026, 6, 2, 14, 35);
    expect(formatCommitDate(date)).toBe("2026-07-02 14:35");
  });

  it("pads single-digit month, day, hour, minute", () => {
    const date = new Date(2026, 0, 5, 9, 5);
    expect(formatCommitDate(date)).toBe("2026-01-05 09:05");
  });

  it("returns null for null/undefined/empty", () => {
    expect(formatCommitDate(null)).toBeNull();
    expect(formatCommitDate(undefined)).toBeNull();
    expect(formatCommitDate("")).toBeNull();
  });

  it("returns null for invalid date strings", () => {
    expect(formatCommitDate("not a date")).toBeNull();
  });

  it("accepts ISO string", () => {
    const date = new Date(2026, 6, 2, 14, 35);
    expect(formatCommitDate(date.toISOString())).toBe("2026-07-02 14:35");
  });
});
