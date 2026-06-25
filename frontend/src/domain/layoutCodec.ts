/**
 * Pure codec for graph layout snapshots (PPI-026).
 *
 * `decodeLayout` validates an unknown payload against the layout schema using
 * zod (PPI-022/026/034). No `localStorage` here — that side effect lives in the
 * storage adapter.
 */

import { z } from "zod";

export type LayoutNodePosition = { readonly x: number; readonly y: number; readonly pinned: boolean };

/** On-the-wire layout shape (versioned). */
export interface SerializedLayout {
  readonly version: number;
  readonly nodes: Readonly<Record<string, LayoutNodePosition>>;
}

export type LayoutSnapshot = SerializedLayout;

export type DecodeLayoutResult =
  | { readonly status: "ok"; readonly layout: LayoutSnapshot }
  | { readonly status: "empty" }
  | { readonly status: "invalid"; readonly reason: string };

const LayoutNodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  pinned: z.boolean(),
});

const LayoutSchema = z.object({
  version: z.number(),
  nodes: z.record(z.string(), LayoutNodePositionSchema),
});

/** Decode/validate an unknown payload into a `LayoutSnapshot`. */
export function decodeLayout(raw: unknown, expectedVersion: number): DecodeLayoutResult {
  const parsed = LayoutSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "invalid", reason: parsed.error.message };
  }
  if (parsed.data.version !== expectedVersion) {
    return { status: "invalid", reason: `version mismatch: ${parsed.data.version} !== ${expectedVersion}` };
  }
  if (Object.keys(parsed.data.nodes).length === 0) {
    return { status: "empty" };
  }
  return {
    status: "ok",
    layout: { version: expectedVersion, nodes: parsed.data.nodes as Readonly<Record<string, LayoutNodePosition>> },
  };
}

/** Pure encode: layout -> wire payload (caller JSON.stringifies). */
export function encodeLayout(nodes: Readonly<Record<string, LayoutNodePosition>>, version: number): SerializedLayout {
  return { version, nodes };
}

/** Materialize a `Map` for O(1) lookups by node id. */
export function layoutNodesToMap(nodes: Readonly<Record<string, LayoutNodePosition>>): Map<string, LayoutNodePosition> {
  return new Map(Object.entries(nodes));
}

/** Derive the pinned-id map from a layout (pure). */
export function pinnedFromLayout(nodes: Readonly<Record<string, LayoutNodePosition>>): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(nodes)
      .filter(([, position]) => position.pinned)
      .map(([id]) => [id, true]),
  );
}