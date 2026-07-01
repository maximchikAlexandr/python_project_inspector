import type { GraphEdge, GraphNode } from "../api/client";
import { colorForComplexityRatio, strokeForComplexityRatio } from "../registry/graphUiHelpers";
import {
  buildGraphEdgeViews,
  computeNodeDisplay,
  maxLinkThicknessMetric,
  maxNodeMetric,
  type GraphEdgeViewModel,
  type NodeDisplayModel,
} from "./graphSelectors";
import type { GraphDisplayState } from "./graphSettingsTypes";

export type ModuleGraphViewModel = {
  readonly maxMetric: number;
  readonly thicknessMax: number;
  readonly nodeRadiiById: ReadonlyMap<string, number>;
  readonly edgeViews: readonly GraphEdgeViewModel[];
  readonly nodeDisplayById: ReadonlyMap<string, NodeDisplayModel>;
};

export function buildModuleGraphViewModel(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  display: GraphDisplayState,
  enabledEdgeKinds: Readonly<Record<string, boolean>>,
  lineCategories: ReadonlySet<string>,
  selectedModule: string | null,
  hoveredId: string | null,
  labelZoom: number,
  badgeMetrics: readonly string[] = [],
): ModuleGraphViewModel {
  const maxMetric = maxNodeMetric(nodes, display.nodeSizeMetric, lineCategories);
  const thicknessMax = maxLinkThicknessMetric(edges, display, enabledEdgeKinds);

  const edgeViews = buildGraphEdgeViews(edges, display, enabledEdgeKinds, thicknessMax);

  const nodeRadiiById = new Map<string, number>();
  const nodeDisplayById = new Map<string, NodeDisplayModel>();
  for (const node of nodes) {
    const id = node.module_name;
    const ratio = 0;
    nodeRadiiById.set(
      id,
      computeNodeDisplay(node, display, {
        maxMetric,
        brightnessRatio: 0,
        selected: false,
        hovered: false,
        lineCategories,
        fill: "",
        stroke: "",
        zoomScale: 1,
        badgeMetrics,
      }).radius,
    );
    nodeDisplayById.set(
      id,
      computeNodeDisplay(node, display, {
        maxMetric,
        brightnessRatio: ratio,
        selected: selectedModule === id,
        hovered: hoveredId === id,
        lineCategories,
        fill: colorForComplexityRatio(ratio),
        stroke: strokeForComplexityRatio(ratio),
        zoomScale: labelZoom,
        badgeMetrics,
      }),
    );
  }

  return {
    maxMetric,
    thicknessMax,
    nodeRadiiById,
    edgeViews,
    nodeDisplayById,
  };
}
