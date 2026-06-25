/**
 * Unit tests for the pure layout codec (PPI-026/042).
 *
 * No localStorage/window here — `decodeLayout`/`encodeLayout` are pure and
 * validate on plain data.
 */
import { describe, it, expect } from "vitest";

import {
  decodeLayout,
  encodeLayout,
  layoutNodesToMap,
  pinnedFromLayout,
  type LayoutNodePosition,
} from "./layoutCodec";

const VERSION = 1;

const pos = (x: number, y: number, pinned = false): LayoutNodePosition => ({ x, y, pinned });

describe("decodeLayout", () => {
  it("returns ok for a valid non-empty layout", () => {
    const raw = { version: VERSION, nodes: { a: pos(1, 2, true), b: pos(3, 4, false) } };
    const result = decodeLayout(raw, VERSION);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.layout.version).toBe(VERSION);
      expect(Object.keys(result.layout.nodes).sort()).toEqual(["a", "b"]);
    }
  });

  it("returns empty when nodes map is empty", () => {
    const result = decodeLayout({ version: VERSION, nodes: {} }, VERSION);
    expect(result.status).toBe("empty");
  });

  it("returns invalid for version mismatch", () => {
    const result = decodeLayout({ version: 99, nodes: { a: pos(1, 2) } }, VERSION);
    expect(result.status).toBe("invalid");
  });

  it("returns invalid when root is not an object", () => {
    expect(decodeLayout(null, VERSION).status).toBe("invalid");
    expect(decodeLayout([], VERSION).status).toBe("invalid");
    expect(decodeLayout(42, VERSION).status).toBe("invalid");
  });

  it("returns invalid when nodes is not an object", () => {
    expect(decodeLayout({ version: VERSION, nodes: [] }, VERSION).status).toBe("invalid");
    expect(decodeLayout({ version: VERSION, nodes: null }, VERSION).status).toBe("invalid");
  });

  it("returns invalid when a node position has the wrong shape (zod rejects)", () => {
    expect(
      decodeLayout({ version: VERSION, nodes: { a: { x: 1, y: 2, pinned: "yes" } } }, VERSION).status,
    ).toBe("invalid");
    expect(
      decodeLayout({ version: VERSION, nodes: { a: { x: "1", y: 2, pinned: true } } }, VERSION).status,
    ).toBe("invalid");
  });

  it("returns invalid with a zod error reason string", () => {
    const result = decodeLayout({ version: VERSION, nodes: { a: { x: 1 } } }, VERSION);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("encodeLayout", () => {
  it("round-trips through decodeLayout", () => {
    const nodes = { a: pos(1, 2, true), b: pos(3, 4, false) };
    const encoded = encodeLayout(nodes, VERSION);
    const decoded = decodeLayout(encoded, VERSION);
    expect(decoded.status).toBe("ok");
    if (decoded.status === "ok") {
      expect(decoded.layout.nodes).toEqual(nodes);
    }
  });
});

describe("layoutNodesToMap", () => {
  it("materializes a Map for O(1) lookups", () => {
    const map = layoutNodesToMap({ a: pos(1, 2, true), b: pos(3, 4, false) });
    expect(map.get("a")).toEqual(pos(1, 2, true));
    expect(map.get("b")).toEqual(pos(3, 4, false));
    expect(map.get("missing")).toBeUndefined();
  });
});

describe("pinnedFromLayout", () => {
  it("keeps only pinned node ids", () => {
    const pinned = pinnedFromLayout({
      a: pos(1, 2, true),
      b: pos(3, 4, false),
      c: pos(5, 6, true),
    });
    expect(Object.keys(pinned).sort()).toEqual(["a", "c"]);
    expect(pinned.a).toBe(true);
    expect(pinned.c).toBe(true);
  });

  it("returns an empty record when nothing is pinned", () => {
    expect(pinnedFromLayout({ a: pos(1, 2, false) })).toEqual({});
  });
});