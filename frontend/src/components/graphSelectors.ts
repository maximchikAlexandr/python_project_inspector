import { clamp, filter, map, pipe, sumBy } from "remeda";

import type { GraphEdge, GraphNode } from "../api/client";
import {
  GRAPH_EDGE_KIND_KEYS,
  MAX_NODE_RADIUS,
  MIN_NODE_RADIUS,
  NEUTRAL_NODE_RADIUS,
  lineCategoryTotal,
  type GraphEdgeKind,
  type LineCategoryKey,
} from "../registry/odooProfile";
import type { GraphDisplayState, GraphFilterState } from "./graphSettingsTypes";
import { edgeStrokeWidth } from "./graphViewPure";

export type GraphStats = {
  totalNodes: number;
  visibleNodes: number;
  totalEdges: number;
  visibleEdges: number;
  hiddenByFilters: number;
  selectedModule: string | null;
  focusState: { enabled: boolean; depth: number; direction: GraphFilterState["directionMode"] };
};

export type GraphFilterResult = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
  noKindsSelected: boolean;
  allEdgesBelowThreshold: boolean;
  noNeighborsMatch: boolean;
};

export type NodeDisplayModel = {
  radius: number;
  fill: string;
  stroke: string;
  label: string | null;
  badges: { in: number; out: number; files: number; methods: number } | null;
};

export type EdgeDisplayModel = { thickness: number; visible: boolean; label: string | null };

export type GraphEdgeViewModel = {
  key: string;
  sourceId: string;
  targetId: string;
  offset: number;
  edge: GraphEdge;
  display: EdgeDisplayModel;
};

export function computeEdgeVisibleScore(
  edge: GraphEdge,
  enabledEdgeKinds: Record<GraphEdgeKind, boolean>,
): number {
  return sumBy(
    GRAPH_EDGE_KIND_KEYS.filter((kind) => enabledEdgeKinds[kind]),
    (kind) => edge.breakdown[kind] ?? 0,
  );
}

export function computeLocalGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  focusModule: string | null,
  depth: number,
  directionMode: GraphFilterState["directionMode"],
): { nodes: GraphNode[]; edges: GraphEdge[]; noNeighborsMatch: boolean } {
  if (!focusModule) {
    return { nodes, edges, noNeighborsMatch: false };
  }
  const nodeIds = new Set(map(nodes, (node) => node.module_name));
  if (!nodeIds.has(focusModule)) {
    return { nodes: [], edges: [], noNeighborsMatch: false };
  }
  const adjacency = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string) => {
    if (!adjacency.has(from)) {
      adjacency.set(from, new Set());
    }
    adjacency.get(from)!.add(to);
  };
  for (const edge of edges) {
    if (directionMode === "both" || directionMode === "outgoing") {
      addEdge(edge.source, edge.target);
    }
    if (directionMode === "both" || directionMode === "incoming") {
      addEdge(edge.target, edge.source);
    }
  }
  const visited = new Set<string>([focusModule]);
  let frontier = [focusModule];
  for (let hop = 0; hop < depth; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor) && nodeIds.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  const filteredEdges = filter(
    edges,
    (edge) => visited.has(edge.source) && visited.has(edge.target),
  );
  const filteredNodes = filter(nodes, (node) => visited.has(node.module_name));
  const noNeighborsMatch = visited.size === 1 && filteredEdges.length === 0;
  return { nodes: filteredNodes, edges: filteredEdges, noNeighborsMatch };
}

function filterEdgesByScore(
  edges: GraphEdge[],
  filterState: GraphFilterState,
): GraphEdge[] {
  return filter(edges, (edge) => {
    const score = computeEdgeVisibleScore(edge, filterState.enabledEdgeKinds);
    if (score < filterState.minEdgeScore) {
      return false;
    }
    if (score === 0 && !filterState.includeZeroScore) {
      return false;
    }
    return true;
  });
}

export function applyGraphFilters(
  nodes: GraphNode[],
  edges: GraphEdge[],
  filterState: GraphFilterState,
  selectedModule: string | null = null,
): GraphFilterResult {
  const allKindsDisabled = pipe(
    Object.values(filterState.enabledEdgeKinds),
    (values) => values.every((enabled) => !enabled),
  );
  if (allKindsDisabled) {
    return {
      nodes: [],
      edges: [],
      stats: {
        totalNodes: nodes.length,
        visibleNodes: 0,
        totalEdges: edges.length,
        visibleEdges: 0,
        hiddenByFilters: edges.length,
        selectedModule: filterState.focusModule ?? selectedModule,
        focusState: {
          enabled: filterState.focusEnabled,
          depth: filterState.localDepth,
          direction: filterState.directionMode,
        },
      },
      noKindsSelected: true,
      allEdgesBelowThreshold: false,
      noNeighborsMatch: false,
    };
  }
  const filteredEdges = filterEdgesByScore(edges, filterState);
  const allBelowThreshold = filteredEdges.length === 0 && edges.length > 0;
  let visibleNodes = nodes;
  let visibleEdges = filteredEdges;
  let noNeighborsMatch = false;
  if (filterState.focusEnabled && filterState.focusModule) {
    const local = computeLocalGraph(
      nodes,
      filteredEdges,
      filterState.focusModule,
      filterState.localDepth,
      filterState.directionMode,
    );
    visibleNodes = local.nodes;
    visibleEdges = local.edges;
    noNeighborsMatch = local.noNeighborsMatch;
  }
  const subjectModule = filterState.focusModule ?? selectedModule;
  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    stats: {
      totalNodes: nodes.length,
      visibleNodes: visibleNodes.length,
      totalEdges: edges.length,
      visibleEdges: visibleEdges.length,
      hiddenByFilters: edges.length - visibleEdges.length,
      selectedModule: subjectModule,
      focusState: {
        enabled: filterState.focusEnabled,
        depth: filterState.localDepth,
        direction: filterState.directionMode,
      },
    },
    noKindsSelected: false,
    allEdgesBelowThreshold: allBelowThreshold,
    noNeighborsMatch,
  };
}

function nodeMetricValue(
  node: GraphNode,
  metric: GraphDisplayState["nodeSizeMetric"],
  lineCategories: Set<LineCategoryKey>,
): number {
  if (metric === "visible_lines") {
    return lineCategoryTotal(node.line_categories, lineCategories);
  }
  if (metric === "total_lines") {
    return sumBy(Object.values(node.line_categories), (value) => value ?? 0);
  }
  if (metric === "method_count") {
    return node.method_count;
  }
  if (metric === "score_in") {
    return node.score_in;
  }
  if (metric === "score_out") {
    return node.score_out;
  }
  return 1;
}

export function maxNodeMetric(
  nodes: GraphNode[],
  metric: GraphDisplayState["nodeSizeMetric"],
  lineCategories: Set<LineCategoryKey>,
): number {
  if (!nodes.length) {
    return 1;
  }
  return Math.max(...map(nodes, (node) => nodeMetricValue(node, metric, lineCategories)));
}

export function computeNodeDisplay(
  node: GraphNode,
  display: GraphDisplayState,
  context: {
    maxMetric: number;
    brightnessRatio: number;
    selected: boolean;
    hovered: boolean;
    lineCategories: Set<LineCategoryKey>;
    fill: string;
    stroke: string;
    zoomScale: number;
  },
): NodeDisplayModel {
  const metricValue = nodeMetricValue(node, display.nodeSizeMetric, context.lineCategories);
  const radius =
    display.nodeSizeMetric === "fixed"
      ? NEUTRAL_NODE_RADIUS * display.nodeSizeScale
      : display.nodeSizeMetric === "visible_lines" && context.lineCategories.size === 0
        ? NEUTRAL_NODE_RADIUS * display.nodeSizeScale
        : clamp(
          Math.sqrt(Math.max(metricValue, 1)) *
            (MAX_NODE_RADIUS / Math.sqrt(Math.max(context.maxMetric, 1))) *
            display.nodeSizeScale,
          { min: MIN_NODE_RADIUS, max: MAX_NODE_RADIUS },
        );
  let label: string | null = null;
  if (display.labelMode === "always") {
    label = node.module_name;
  } else if (display.labelMode === "selected" && context.selected) {
    label = node.module_name;
  } else if (display.labelMode === "hover" && context.hovered) {
    label = node.module_name;
  }
  if (label && display.labelFadeThreshold > 0 && context.zoomScale < display.labelFadeThreshold) {
    label = null;
  }
  return {
    radius,
    fill: context.fill,
    stroke: context.selected ? "#dc2626" : context.stroke,
    label,
    badges: display.showNodeBadges
      ? {
          in: node.score_in,
          out: node.score_out,
          files: node.python_file_count,
          methods: node.method_count,
        }
      : null,
  };
}

function edgeThicknessMetric(
  edge: GraphEdge,
  display: GraphDisplayState,
  visibleScore: number,
): number {
  if (display.linkThicknessMetric === "total_points") {
    return edge.breakdown.total;
  }
  if (display.linkThicknessMetric === "selected_kind_points") {
    return visibleScore;
  }
  if (display.linkThicknessMetric === "score") {
    return edge.score;
  }
  return 18;
}

export function maxLinkThicknessMetric(
  edges: GraphEdge[],
  display: GraphDisplayState,
  enabledEdgeKinds: Record<GraphEdgeKind, boolean>,
): number {
  if (!edges.length) {
    return 1;
  }
  return Math.max(
    ...map(edges, (edge) => {
      const visibleScore = computeEdgeVisibleScore(edge, enabledEdgeKinds);
      return edgeThicknessMetric(edge, display, visibleScore);
    }),
  );
}

export function computeEdgeDisplay(
  edge: GraphEdge,
  display: GraphDisplayState,
  context: { visibleScore: number; maxThicknessMetric: number },
): EdgeDisplayModel {
  const metric = edgeThicknessMetric(edge, display, context.visibleScore);
  const thickness =
    display.linkThicknessMetric === "fixed"
      ? edgeStrokeWidth(18, display.linkThicknessScale)
      : display.linkThicknessMetric === "total_points"
        ? edgeStrokeWidth(metric, display.linkThicknessScale)
        : edgeStrokeWidth(
            (metric / Math.max(context.maxThicknessMetric, 1)) * 18,
            display.linkThicknessScale,
          );
  return {
    thickness,
    visible: true,
    label: display.showEdgeLabels ? `${edge.source} → ${edge.target}` : null,
  };
}

export function buildGraphEdgeViews(
  edges: GraphEdge[],
  display: GraphDisplayState,
  enabledEdgeKinds: Record<GraphEdgeKind, boolean>,
  maxThicknessMetric: number,
): GraphEdgeViewModel[] {
  const edgeKeys = new Set(edges.map((edge) => `${edge.source}|${edge.target}`));
  return edges.map((edge) => {
    const reverse = edgeKeys.has(`${edge.target}|${edge.source}`);
    const offset = reverse && edge.source > edge.target ? 18 : reverse ? -18 : 0;
    const sourceId = edge.source;
    const targetId = edge.target;
    const visibleScore = computeEdgeVisibleScore(edge, enabledEdgeKinds);
    return {
      key: `${sourceId}-${targetId}-${offset}`,
      sourceId,
      targetId,
      offset,
      edge,
      display: computeEdgeDisplay(edge, display, { visibleScore, maxThicknessMetric }),
    };
  });
}

export function maxEffectiveEdgeScore(edges: GraphEdge[], enabledKinds: Record<GraphEdgeKind, boolean>): number {
  if (!edges.length) {
    return 0;
  }
  return Math.max(...map(edges, (edge) => computeEdgeVisibleScore(edge, enabledKinds)));
}
