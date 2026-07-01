export type GraphSectionKey = "filters" | "display" | "forces" | "focus" | "stats";

export type GraphFilterState = {
  enabledEdgeKinds: Record<string, boolean>;
  minEdgeScore: number;
  includeZeroScore: boolean;
  focusEnabled: boolean;
  focusModule: string | null;
  localDepth: number;
  directionMode: "both" | "incoming" | "outgoing";
};

export type GraphDisplayState = {
  showArrows: boolean;
  labelMode: "always" | "hover" | "selected" | "none";
  labelFadeThreshold: number;
  nodeSizeMetric: string;
  nodeSizeScale: number;
  linkThicknessMetric: string;
  linkThicknessScale: number;
  fadeNonNeighbors: boolean;
  showEdgeLabels: boolean;
  showNodeBadges: boolean;
};

export type GraphForceState = {
  centerStrength: number;
  repelStrength: number;
  linkStrength: number;
  linkDistance: number;
  collidePadding: number;
  velocityDecay: number;
};

export type GraphSettings = {
  filter: GraphFilterState;
  display: GraphDisplayState;
  force: GraphForceState;
  sectionsExpanded: Record<GraphSectionKey, boolean>;
};

export const DEFAULT_ENABLED_EDGE_KINDS: Record<string, boolean> = {};

export const DEFAULT_FILTER_STATE: GraphFilterState = {
  enabledEdgeKinds: { ...DEFAULT_ENABLED_EDGE_KINDS },
  minEdgeScore: 0,
  includeZeroScore: false,
  focusEnabled: false,
  focusModule: null,
  localDepth: 1,
  directionMode: "both",
};

export const DEFAULT_DISPLAY_STATE: GraphDisplayState = {
  showArrows: true,
  labelMode: "always",
  labelFadeThreshold: 0,
  nodeSizeMetric: "visible_lines",
  nodeSizeScale: 1,
  linkThicknessMetric: "total_points",
  linkThicknessScale: 1,
  fadeNonNeighbors: false,
  showEdgeLabels: false,
  showNodeBadges: false,
};

export const DEFAULT_FORCE_STATE: GraphForceState = {
  centerStrength: 0.05,
  repelStrength: -900,
  linkStrength: 0.15,
  linkDistance: 200,
  collidePadding: 6,
  velocityDecay: 0.88,
};

export const DEFAULT_SECTIONS_EXPANDED: Record<GraphSectionKey, boolean> = {
  filters: true,
  display: true,
  forces: true,
  focus: true,
  stats: true,
};

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  filter: DEFAULT_FILTER_STATE,
  display: DEFAULT_DISPLAY_STATE,
  force: DEFAULT_FORCE_STATE,
  sectionsExpanded: { ...DEFAULT_SECTIONS_EXPANDED },
};

export const SETTINGS_STORAGE_KEY = "ppi.graph.settings";
export const SETTINGS_SCHEMA_VERSION = 1;
export const LAYOUT_SCHEMA_VERSION = 1;
