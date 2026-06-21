# Contract: Graph Selectors (pure, React-free)

**Module**: `frontend/src/components/graphSelectors.ts`

Pure functions that shape graph data from settings. No I/O, no React, deterministic, total (defined output for every input, including empty). These are the unit-testable "functional core" of the graph view.

## Implementation style (mandatory)

- Collection transforms MUST use [remeda](https://github.com/remeda/remeda): `pipe`, `map`, `filter`, `sumBy`, `clamp`, and related utilities — not imperative `for` loops or nested `reduce` for filtering/mapping/aggregating.
- Non-trivial pipelines (filter → score → focus subgraph → stats) SHOULD be expressed as `pipe(input, step1, step2, …)` for readability and testability.
- Remeda is imported only in pure modules (`graphSelectors.ts`, registry metric helpers); React components and d3/DOM code do not use remeda for effects.

## Functions

```ts
import type { GraphNode, GraphEdge } from "../api/client";
import type { GraphFilterState, GraphDisplayState, GraphEdgeKind } from "./graphSettingsTypes";

export function computeEdgeVisibleScore(
  edge: GraphEdge,
  enabledEdgeKinds: Record<GraphEdgeKind, boolean>,
): number;

export type GraphStats = {
  totalNodes: number;
  visibleNodes: number;
  totalEdges: number;
  visibleEdges: number;
  hiddenByFilters: number;
  selectedModule: string | null;
  focusState: { enabled: boolean; depth: number; direction: GraphFilterState["directionMode"] };
};

export function applyGraphFilters(
  nodes: GraphNode[],
  edges: GraphEdge[],
  filter: GraphFilterState,
): { nodes: GraphNode[]; edges: GraphEdge[]; stats: GraphStats; noKindsSelected: boolean };

export function computeLocalGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  focusModule: string | null,
  depth: number,
  directionMode: GraphFilterState["directionMode"],
): { nodes: GraphNode[]; edges: GraphEdge[] };

export type NodeDisplayModel = {
  radius: number;
  fill: string;
  stroke: string;
  label: string | null;
  badges: { in: number; out: number; files: number; methods: number } | null;
};

export function computeNodeDisplay(
  node: GraphNode,
  display: GraphDisplayState,
  context: { maxMetric: number; brightnessRatio: number; selected: boolean },
): NodeDisplayModel;

export type EdgeDisplayModel = { thickness: number; visible: boolean; label: string | null };

export function computeEdgeDisplay(
  edge: GraphEdge,
  display: GraphDisplayState,
  context: { visibleScore: number; maxThicknessMetric: number },
): EdgeDisplayModel;
```

## Semantics

- **`computeEdgeVisibleScore`**: sum of `edge.breakdown` components whose `GraphEdgeKind` is enabled. (FR-007)
- **`applyGraphFilters`** (order matters, FR-020):
  1. If every kind is disabled → return empty nodes/edges with `noKindsSelected = true` and stats reflecting all hidden. (FR-011)
  2. Compute each edge's effective score; drop edges with score `< minEdgeScore`, and drop zero-score edges unless `includeZeroScore`. (FR-008/009)
  3. If `focusEnabled && focusModule`, hand the filtered nodes/edges to `computeLocalGraph`. (FR-020)
  4. Drop nodes with no remaining incident edges only when focus is on; in global mode keep all nodes (parity with today). 
  5. Populate `stats` (`hiddenByFilters = totalEdges - visibleEdges`, etc.). (FR-017)
- **`computeLocalGraph`**: BFS from `focusModule` over the **already-filtered** edges to `depth` hops; follow only outgoing / incoming / both per `directionMode`. Return the reachable node set (always includes the subject) and induced edges. Subject with no qualifying neighbors → just the subject (edge case). (FR-019/020)
- **`computeNodeDisplay`**: radius from `nodeSizeMetric` value scaled by `nodeSizeScale` (reusing the existing `sqrt` mapping; `fixed` → neutral radius); fill/stroke from existing brightness ratio; `label` per `labelMode`/`labelFadeThreshold`; `badges` only when `showNodeBadges`, using already-available facts. (FR-013/014/016)
- **`computeEdgeDisplay`**: thickness from `linkThicknessMetric` (`total_points` = `breakdown.total`, `selected_kind_points` = effective score, `score` = `edge.score`, `fixed`) × `linkThicknessScale`; `label` only when `showEdgeLabels`. (FR-010/015/016)

## Test-facing guarantees

- Disabling a kind never increases any edge's visible score.
- `applyGraphFilters` is idempotent given identical inputs and never mutates its arguments.
- `computeLocalGraph(depth=1)` returns exactly the subject + its direct (filtered, direction-respecting) neighbors.
