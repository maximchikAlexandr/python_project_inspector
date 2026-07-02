import { describe, it, expect } from "vitest";

import type { CommitRow } from "../api/client";
import { nextTimelapseState } from "./timelapseTransforms";

function commit(order: number, hash: string): CommitRow {
  return { commit_order: order, commit_hash: hash, authored_at: null, summary: null };
}

const commits = [commit(1, "a"), commit(2, "b"), commit(3, "c")];

describe("nextTimelapseState", () => {
  it("play from final commit moves to first commit and starts playing", () => {
    const out = nextTimelapseState({
      action: { kind: "play" },
      commits,
      selectedCommit: "c",
      playing: false,
      speed: 1000,
    });
    expect(out.playing).toBe(true);
    expect(out.selectedCommit).toBe("a");
  });

  it("play from middle commit starts playing at the same commit", () => {
    const out = nextTimelapseState({
      action: { kind: "play" },
      commits,
      selectedCommit: "b",
      playing: false,
      speed: 1000,
    });
    expect(out.playing).toBe(true);
    expect(out.selectedCommit).toBe("b");
  });

  it("next at final commit stops playback", () => {
    const out = nextTimelapseState({
      action: { kind: "next" },
      commits,
      selectedCommit: "c",
      playing: true,
      speed: 1000,
    });
    expect(out.playing).toBe(false);
    expect(out.selectedCommit).toBe("c");
  });

  it("next at middle commit advances", () => {
    const out = nextTimelapseState({
      action: { kind: "next" },
      commits,
      selectedCommit: "b",
      playing: true,
      speed: 1000,
    });
    expect(out.selectedCommit).toBe("c");
  });

  it("prev moves to previous commit", () => {
    const out = nextTimelapseState({
      action: { kind: "prev" },
      commits,
      selectedCommit: "b",
      playing: true,
      speed: 1000,
    });
    expect(out.selectedCommit).toBe("a");
  });

  it("prev at first commit stays", () => {
    const out = nextTimelapseState({
      action: { kind: "prev" },
      commits,
      selectedCommit: "a",
      playing: true,
      speed: 1000,
    });
    expect(out.selectedCommit).toBe("a");
  });

  it("single-commit timeline cannot play", () => {
    const out = nextTimelapseState({
      action: { kind: "play" },
      commits: [commit(1, "a")],
      selectedCommit: "a",
      playing: false,
      speed: 1000,
    });
    expect(out.playing).toBe(false);
  });

  it("pause always pauses", () => {
    const out = nextTimelapseState({
      action: { kind: "pause" },
      commits,
      selectedCommit: "b",
      playing: true,
      speed: 1000,
    });
    expect(out.playing).toBe(false);
  });

  it("speed changes speed only", () => {
    const out = nextTimelapseState({
      action: { kind: "speed", speed: 500 },
      commits,
      selectedCommit: "b",
      playing: true,
      speed: 1000,
    });
    expect(out.speed).toBe(500);
    expect(out.playing).toBe(true);
    expect(out.selectedCommit).toBe("b");
  });
});
