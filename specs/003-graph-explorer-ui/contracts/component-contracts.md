# Contract: Component Interfaces

Defines the props/callback contracts between `SnapshotPage`, `GraphSettingsPanel`, and `ModuleGraph`. These are internal UI contracts (no HTTP/CLI surface).

## ModuleGraph (modified)

`ModuleGraph` receives **already-filtered** nodes/edges plus display/force state and graph-control callbacks. It no longer owns filtering or hard-coded forces.

```ts
type ModuleGraphProps = {
  nodes: GraphNode[];                 // post-applyGraphFilters
  edges: GraphEdge[];                 // post-applyGraphFilters
  display: GraphDisplayState;
  force: GraphForceState;
  enabledEdgeKinds: Record<GraphEdgeKind, boolean>;  // for selected_kind_points thickness
  brightnessCriteria: Set<BrightnessCriterion>;
  lineCategories: Set<LineCategoryKey>;
  selectedModule: string | null;
  onSelectModule: (name: string | null) => void;
  pinned: Record<string, boolean>;
  onTogglePin: (moduleName: string) => void;          // double-click
  layoutCommand: { kind: "restart" | "reset" | "save" | "load" | "unpinAll"; nonce: number } | null;
  onLayoutSnapshot?: (nodes: Record<string, { x: number; y: number; pinned: boolean }>) => void;
  zoomCommand: { kind: "in" | "out" | "fit"; nonce: number } | null;  // from panel (FR-004)
  loading?: boolean;
};
```

**Behavioral requirements**:
- Renders arrows only when `display.showArrows`; labels per `display.labelMode`/`labelFadeThreshold`; node size from `display.nodeSizeMetric` × scale; edge thickness from `display.linkThicknessMetric` × scale. (FR-012..016)
- Hover highlight + fade when `display.fadeNonNeighbors` (imperative opacity on refs); no-op when off. (FR-022/023)
- Double-click a node → `onTogglePin`; pinned nodes keep `fx/fy` across restart and show a marker. (FR-026)
- `layoutCommand`/`zoomCommand` are nonce-tagged so repeated identical commands re-fire; `save` triggers `onLayoutSnapshot`. `reset` clears in-memory positions/pins AND deletes the saved key (permanent); `unpinAll` clears in-memory pins only and leaves the saved key intact (FR-027). `zoom`/`fit` are transient view changes and are never persisted (FR-004). (FR-004/025/027)
- Force values come from `force`; slider changes update live forces and nudge `alpha().restart()`. (FR-024)
- When the visible node set changes, retained nodes keep their positions (seed from current positions); only new nodes are randomized. (research D8)

## GraphSettingsPanel (new)

```ts
type GraphSettingsPanelProps = {
  settings: GraphSettings;
  onFilterChange: (patch: Partial<GraphFilterState>) => void;
  onDisplayChange: (patch: Partial<GraphDisplayState>) => void;
  onForceChange: (patch: Partial<GraphForceState>) => void;
  onResetForces: () => void;
  onZoom: (kind: "in" | "out" | "fit") => void;
  onLayout: (kind: "restart" | "reset" | "save" | "load" | "unpinAll") => void;
  stats: GraphStats;
  edgeKindMeta: { key: GraphEdgeKind; label: string; color: string }[];   // from registry
  selectedModule: string | null;
  onClearFocus: () => void;
  commits: CommitRow[];
  timelapse: { playing: boolean; speed: number };
  onTimelapse: (action: { kind: "play" | "pause" | "prev" | "next"; speed?: number }) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};
```

**Behavioral requirements**:
- Sections: Filters, Display, Forces, Focus, Stats (Mantine `Accordion`), plus zoom buttons and a time-lapse group. US1 renders Forces/Focus as empty accordion items; US2/US3 populate them. US1 renders time-lapse as a disabled placeholder (commit position only); US4 wires live playback. (FR-001)
- Collapses to a compact toggle button; on narrow screens renders inside a `Drawer`. (FR-002/005)
- Edge-kind toggles, node-size/link-thickness metric options, and legend colors derive from `edgeKindMeta`/registry, not hard-coded. (Constitution IV)
- When no kinds enabled, surfaces the "no relationship kinds selected" state. (FR-011)
- Stats values come straight from `stats` (FR-017); a compact legend in the same Stats section explains size/color/thickness/kind mappings (FR-018).

## SnapshotPage (modified)

- Owns `useGraphSettings()` and selection; computes `applyGraphFilters(...)` (memoized) and passes the result + display/force to `ModuleGraph` and `stats` to the panel.
- Moves the existing "Include zero-score edges" checkbox into the panel's Filters section (the page-level control is removed/relocated). (FR-009)
- Sets `filter.focusModule` on node select **without** auto-enabling `focusEnabled`; "Clear focus" resets focus; auto-clears focus when the subject is absent after a commit change (FR-021/021a).
- Drives the time-lapse by advancing `selectedCommit` over ordered `commits`, stopping on the last commit. (FR-030/031)
- Provides the project/commit key for layout persistence. (persistence.md)
