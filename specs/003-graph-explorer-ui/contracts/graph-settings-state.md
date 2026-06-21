# Contract: Graph Settings State & Hook

**Module**: `frontend/src/components/graphSettingsTypes.ts`, `frontend/src/components/useGraphSettings.ts`

This contract defines the typed settings state, its defaults, and the hook API. See `data-model.md` for field tables.

## Types

```ts
export type GraphEdgeKind = "model_reuse" | "extension_or_method" | "view" | "field_property";

export type GraphFilterState = {
  enabledEdgeKinds: Record<GraphEdgeKind, boolean>;
  minEdgeScore: number;
  includeZeroScore: boolean;
  focusEnabled: boolean;
  focusModule: string | null;
  localDepth: number;          // 1..5
  directionMode: "both" | "incoming" | "outgoing";
};

export type GraphDisplayState = {
  showArrows: boolean;
  labelMode: "always" | "hover" | "selected" | "none";
  labelFadeThreshold: number;
  nodeSizeMetric: "visible_lines" | "total_lines" | "method_count" | "score_in" | "score_out" | "fixed";
  nodeSizeScale: number;
  linkThicknessMetric: "total_points" | "selected_kind_points" | "score" | "fixed";
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
  sectionsExpanded: Record<"filters" | "display" | "forces" | "focus" | "stats", boolean>;
};
```

## Defaults (MUST reproduce today's graph — FR-032)

- `DEFAULT_FILTER_STATE`: every `GraphEdgeKind` enabled, `minEdgeScore = 0`, `includeZeroScore = false`, focus off, `localDepth = 1`, `directionMode = "both"`.
- `DEFAULT_DISPLAY_STATE`: `showArrows = true`, `labelMode = "always"`, `labelFadeThreshold = 0`, `nodeSizeMetric = "visible_lines"`, `nodeSizeScale = 1`, `linkThicknessMetric = "total_points"`, `linkThicknessScale = 1`, `fadeNonNeighbors = false`, `showEdgeLabels = false`, `showNodeBadges = false`.
- `DEFAULT_FORCE_STATE`: matches existing `ModuleGraph` constants (`centerStrength 0.05`, `repelStrength -900`, link strength/distance baselines, `collidePadding 6`, `velocityDecay 0.88`).
- `DEFAULT_SECTIONS_EXPANDED`: all five keys (`filters`, `display`, `forces`, `focus`, `stats`) set to `true` (FR-001a).

## Hook API

```ts
function useGraphSettings(): {
  settings: GraphSettings;
  setFilter: (patch: Partial<GraphFilterState>) => void;
  setDisplay: (patch: Partial<GraphDisplayState>) => void;
  setForce: (patch: Partial<GraphForceState>) => void;
  setSectionsExpanded: (patch: Partial<GraphSettings["sectionsExpanded"]>) => void;
  resetForces: () => void;     // force -> DEFAULT_FORCE_STATE
  resetAll: () => void;        // all groups + sectionsExpanded -> defaults
  saveDisabled: boolean;       // true when localStorage save is unavailable (FR-036)
  saveNotice: string | null;   // non-blocking notice when saveDisabled
};
```

**Behavioral requirements**:
- On mount, load persisted settings (see `persistence.md`) and **merge over defaults** so unknown/absent fields fall back to defaults (forward-compatible). Use remeda `mergeDeep` (or equivalent immutable merge) for the defaults overlay — no hand-mutated parse results.
- Any setter persists the merged `GraphSettings` (including `sectionsExpanded`) to the single settings key (FR-003a), unless `saveDisabled`.
- State updates are synchronous to the React tree; the graph reflects changes without reload (FR-003).
- Selecting a node in `SnapshotPage` sets `focusModule` (the focus subject) but MUST NOT auto-set `focusEnabled` — the focus toggle keeps its current value (FR-021). "Clear focus" sets `focusEnabled = false` and `focusModule = null`.
- If `focusModule` is no longer present in the loaded graph after a commit change, the consumer MUST set `focusEnabled = false` and `focusModule = null` and surface a notice (FR-021a).
