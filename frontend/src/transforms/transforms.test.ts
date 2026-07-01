import { describe, it, expect } from "vitest";

import type {
  CommitRow,
  GraphEdge,
  GraphNode,
} from "../api/client";

import {
  commitPositionLabel,
  resolveGraphSelection,
} from "./snapshotTransforms";
import { toCommitSelectOptions, toCommitSelectOptionsShort } from "./commitOptions";

function commit(order: number, hash: string, summary: string | null = null): CommitRow {
  return { commit_order: order, commit_hash: hash, authored_at: null, summary };
}

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
    const nodes: readonly GraphNode[] = [{ module_name: "m", total_lines: 1, line_categories: {} }];
    expect(resolveGraphSelection(nodes, "m").clearFocus).toBe(false);
  });

  it("clears focus when the module is missing", () => {
    const nodes: readonly GraphNode[] = [{ module_name: "m", total_lines: 1, line_categories: {} }];
    const result = resolveGraphSelection(nodes, "missing");
    expect(result.clearFocus).toBe(true);
    expect(result.notice).toContain("missing");
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
