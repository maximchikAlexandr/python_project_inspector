import { describe, it, expect } from "vitest";

import {
  anyNodeVisible,
  clampPanToBounds,
  paddedViewportBounds,
  VIEWPORT_PADDING_RATIO_MIN,
} from "./graphViewport";

describe("anyNodeVisible", () => {
  it("returns true when a node is inside the viewport", () => {
    const positions = new Map([
      ["a", { x: 50, y: 50, radius: 5 }],
      ["b", { x: 200, y: 200, radius: 5 }],
    ]);
    const viewport = { x: 0, y: 0, w: 100, h: 100 };
    expect(anyNodeVisible(positions, viewport)).toBe(true);
  });

  it("returns false when no node is inside the viewport", () => {
    const positions = new Map([
      ["a", { x: 500, y: 500, radius: 5 }],
    ]);
    const viewport = { x: 0, y: 0, w: 100, h: 100 };
    expect(anyNodeVisible(positions, viewport)).toBe(false);
  });

  it("returns true for empty positions (vacuously)", () => {
    expect(anyNodeVisible(new Map(), { x: 0, y: 0, w: 100, h: 100 })).toBe(false);
  });
});

describe("paddedViewportBounds", () => {
  it("applies the requested padding ratio", () => {
    const graphBounds = { x: 100, y: 100, w: 200, h: 200 };
    const viewport = { x: 0, y: 0, w: 100, h: 100 };
    const padded = paddedViewportBounds(graphBounds, viewport, 0.3);
    expect(padded.x).toBe(100 - 30);
    expect(padded.y).toBe(100 - 30);
    expect(padded.w).toBe(200 + 60);
    expect(padded.h).toBe(200 + 60);
  });

  it("uses min ratio as default", () => {
    const padded = paddedViewportBounds({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100 });
    expect(padded.x).toBe(-VIEWPORT_PADDING_RATIO_MIN * 100);
  });
});

describe("clampPanToBounds", () => {
  it("clamps pan inside padded bounds", () => {
    const graphBounds = { x: 0, y: 0, w: 100, h: 100 };
    const viewport = { x: 0, y: 0, w: 100, h: 100 };
    expect(clampPanToBounds({ x: 9999, y: 9999 }, graphBounds, viewport, 0.3)).toEqual({
      x: 30,
      y: 30,
    });
  });
});
