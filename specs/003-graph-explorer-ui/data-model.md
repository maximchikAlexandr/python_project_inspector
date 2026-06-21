# Data Model: Graph Explorer UI

This feature introduces **client-side view state only** — no DuckDB entities, no schema change. The "entities" below are TypeScript shapes held in React state and `localStorage`. They consume the existing `GraphNode`/`GraphEdge`/`EdgeBreakdown` types from `api/client.ts` unchanged.

## Existing consumed types (unchanged)

- `GraphNode`: `module_name`, `total_lines`, `line_categories`, `python_file_count`, `method_count`, `cyclomatic_median`, `cognitive_median`, `jones_median`, `score_in`, `score_out`.
- `GraphEdge`: `source`, `target`, `score`, `breakdown`, `kinds?`, `kind_occurrence_count?`, `evidence_count?`, `commit_hash?`.
- `EdgeBreakdown`: `model_reuse`, `extension_or_method`, `view`, `field_property`, `total`.

## New view-state entities

### GraphEdgeKind

Enum of the filterable breakdown components, sourced from the registry (Principle IV):

```text
"model_reuse" | "extension_or_method" | "view" | "field_property"
```

### GraphFilterState

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `enabledEdgeKinds` | `Record<GraphEdgeKind, boolean>` | all `true` | Disabled kinds excluded from effective score (FR-007) |
| `minEdgeScore` | `number` | `0` | Hide edges below this effective score (FR-008) |
| `includeZeroScore` | `boolean` | `false` | Mirrors today's report toggle; primary control now in panel (FR-009) |
| `focusEnabled` | `boolean` | `false` | Focus mode on/off (FR-019) |
| `focusModule` | `string \| null` | `null` | Focus subject = selected module (FR-021) |
| `localDepth` | `number` (1..5) | `1` | BFS depth for local subgraph (FR-019/020) |
| `directionMode` | `"both" \| "incoming" \| "outgoing"` | `"both"` | Edge direction followed in focus (FR-019/020) |

**Rules**: When all `enabledEdgeKinds` are false → render "no relationship kinds selected" notice (FR-011). Filters are applied before the focus subgraph is built (FR-020, Clarification).

### GraphDisplayState

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `showArrows` | `boolean` | `true` | Directional arrow markers (FR-012); default matches today |
| `labelMode` | `"always" \| "hover" \| "selected" \| "none"` | `"always"` | Node label visibility (FR-013); default matches today |
| `labelFadeThreshold` | `number` | `0` | Hide labels below this zoom/size point (FR-013) |
| `nodeSizeMetric` | `"visible_lines" \| "total_lines" \| "method_count" \| "score_in" \| "score_out" \| "fixed"` | `"visible_lines"` | FR-014; default matches today's line-category sizing |
| `nodeSizeScale` | `number` | `1` | Multiplier (FR-014) |
| `linkThicknessMetric` | `"total_points" \| "selected_kind_points" \| "score" \| "fixed"` | `"total_points"` | FR-015; default matches today |
| `linkThicknessScale` | `number` | `1` | Multiplier (FR-015) |
| `fadeNonNeighbors` | `boolean` | `false` | Hover highlight/fade (FR-022); off = today's behavior |
| `showEdgeLabels` | `boolean` | `false` | Opt-in edge labels (FR-016) |
| `showNodeBadges` | `boolean` | `false` | Opt-in IN/OUT/files/methods badges (FR-016) |

### GraphForceState

Replaces the hard-coded constants in `ModuleGraph` (FR-024). Defaults equal the current values so the layout is unchanged (FR-032):

| Field | Type | Default (current value) |
|-------|------|-------------------------|
| `centerStrength` | `number` | `0.05` |
| `repelStrength` | `number` | `-900` |
| `linkStrength` | `number` | current link strength formula baseline |
| `linkDistance` | `number` | current link distance formula baseline |
| `collidePadding` | `number` | `6` |
| `velocityDecay` | `number` | `0.88` |

### SavedLayout (per project/repository + commit)

| Field | Type | Notes |
|-------|------|-------|
| key | `string` | `ppi.graph.layout.<projectOrRepo>.<commitHash>` |
| `nodes` | `Record<string, { x: number; y: number; pinned: boolean }>` | Restored on load; unknown nodes auto-placed; missing entries ignored (FR-028/029) |

### SettingsPersistence (global, not per-commit)

| Field | Type | Notes |
|-------|------|-------|
| key | `string` | single key, e.g. `ppi.graph.settings` |
| value | `{ version: 1; filter: GraphFilterState; display: GraphDisplayState; force: GraphForceState; sectionsExpanded: Record<string, boolean> }` | Persisted on change, merged over defaults on load; version mismatch → treat as absent (FR-003a/FR-036) |

### TimelapseState (transient, not persisted)

| Field | Type | Notes |
|-------|------|-------|
| `playing` | `boolean` | Play/pause (FR-030) |
| `speed` | `number` | Interval between commits (FR-030) |
| current position | derived from `selectedCommit` + ordered `commits` | Stops on last commit (FR-031, Clarification) |

### Derived: GraphStats

Computed by `applyGraphFilters`, displayed in the Stats section (FR-017):

`totalNodes`, `visibleNodes`, `totalEdges`, `visibleEdges`, `hiddenByFilters`, `selectedModule`, `focusState` (`{ enabled, depth, direction }`).

### Derived: NodeDisplayModel / EdgeDisplayModel

Per-element render models returned by `computeNodeDisplay` / `computeEdgeDisplay` (radius/color/label/badges; thickness/visibility/label) — see `contracts/graph-selectors.md`.
