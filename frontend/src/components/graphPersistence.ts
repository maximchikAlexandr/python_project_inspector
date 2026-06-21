import { map } from "remeda";

import {
  DEFAULT_ENABLED_EDGE_KINDS,
  DEFAULT_DISPLAY_STATE,
  DEFAULT_FILTER_STATE,
  DEFAULT_FORCE_STATE,
  DEFAULT_GRAPH_SETTINGS,
  DEFAULT_SECTIONS_EXPANDED,
  LAYOUT_SCHEMA_VERSION,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  type GraphDisplayState,
  type GraphFilterState,
  type GraphForceState,
  type GraphSettings,
} from "./graphSettingsTypes";

export type PersistedSettings = {
  version: typeof SETTINGS_SCHEMA_VERSION;
  filter: GraphSettings["filter"];
  display: GraphSettings["display"];
  force: GraphSettings["force"];
  sectionsExpanded: GraphSettings["sectionsExpanded"];
};

export type PersistedLayout = {
  version: typeof LAYOUT_SCHEMA_VERSION;
  nodes: Record<string, { x: number; y: number; pinned: boolean }>;
};

export type ParseSettingsResult = {
  settings: GraphSettings;
  saveDisabled: boolean;
};

export type ParseLayoutResult = {
  layout: PersistedLayout | null;
  saveDisabled: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringOrNull(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" || value === null ? value : fallback;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function enumValue<T extends string>(value: unknown, fallback: T, allowed: readonly T[]): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function normalizeBooleanRecord<T extends string>(
  value: unknown,
  defaults: Record<T, boolean>,
): Record<T, boolean> {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    map(Object.entries(defaults) as [T, boolean][], ([key, fallback]) => [
      key,
      booleanValue(source[key], fallback),
    ]),
  ) as Record<T, boolean>;
}

function normalizeFilter(value: unknown): GraphFilterState {
  const source = isRecord(value) ? value : {};
  return {
    enabledEdgeKinds: normalizeBooleanRecord(source.enabledEdgeKinds, DEFAULT_ENABLED_EDGE_KINDS),
    minEdgeScore: numberInRange(source.minEdgeScore, DEFAULT_FILTER_STATE.minEdgeScore, 0, 100000),
    includeZeroScore: booleanValue(source.includeZeroScore, DEFAULT_FILTER_STATE.includeZeroScore),
    focusEnabled: booleanValue(source.focusEnabled, DEFAULT_FILTER_STATE.focusEnabled),
    focusModule: stringOrNull(source.focusModule, DEFAULT_FILTER_STATE.focusModule),
    localDepth: numberInRange(source.localDepth, DEFAULT_FILTER_STATE.localDepth, 1, 5),
    directionMode: enumValue(source.directionMode, DEFAULT_FILTER_STATE.directionMode, [
      "both",
      "incoming",
      "outgoing",
    ]),
  };
}

function normalizeDisplay(value: unknown): GraphDisplayState {
  const source = isRecord(value) ? value : {};
  return {
    showArrows: booleanValue(source.showArrows, DEFAULT_DISPLAY_STATE.showArrows),
    labelMode: enumValue(source.labelMode, DEFAULT_DISPLAY_STATE.labelMode, [
      "always",
      "hover",
      "selected",
      "none",
    ]),
    labelFadeThreshold: numberInRange(
      source.labelFadeThreshold,
      DEFAULT_DISPLAY_STATE.labelFadeThreshold,
      0,
      2,
    ),
    nodeSizeMetric: enumValue(source.nodeSizeMetric, DEFAULT_DISPLAY_STATE.nodeSizeMetric, [
      "visible_lines",
      "total_lines",
      "method_count",
      "score_in",
      "score_out",
      "fixed",
    ]),
    nodeSizeScale: numberInRange(source.nodeSizeScale, DEFAULT_DISPLAY_STATE.nodeSizeScale, 0.5, 2),
    linkThicknessMetric: enumValue(source.linkThicknessMetric, DEFAULT_DISPLAY_STATE.linkThicknessMetric, [
      "total_points",
      "selected_kind_points",
      "score",
      "fixed",
    ]),
    linkThicknessScale: numberInRange(
      source.linkThicknessScale,
      DEFAULT_DISPLAY_STATE.linkThicknessScale,
      0.5,
      2,
    ),
    fadeNonNeighbors: booleanValue(source.fadeNonNeighbors, DEFAULT_DISPLAY_STATE.fadeNonNeighbors),
    showEdgeLabels: booleanValue(source.showEdgeLabels, DEFAULT_DISPLAY_STATE.showEdgeLabels),
    showNodeBadges: booleanValue(source.showNodeBadges, DEFAULT_DISPLAY_STATE.showNodeBadges),
  };
}

function normalizeForce(value: unknown): GraphForceState {
  const source = isRecord(value) ? value : {};
  return {
    centerStrength: numberInRange(source.centerStrength, DEFAULT_FORCE_STATE.centerStrength, 0, 0.3),
    repelStrength: numberInRange(source.repelStrength, DEFAULT_FORCE_STATE.repelStrength, -2000, -100),
    linkStrength: numberInRange(source.linkStrength, DEFAULT_FORCE_STATE.linkStrength, 0.05, 0.5),
    linkDistance: numberInRange(source.linkDistance, DEFAULT_FORCE_STATE.linkDistance, 80, 400),
    collidePadding: numberInRange(source.collidePadding, DEFAULT_FORCE_STATE.collidePadding, 0, 20),
    velocityDecay: numberInRange(source.velocityDecay, DEFAULT_FORCE_STATE.velocityDecay, 0.5, 0.99),
  };
}

function normalizeSections(value: unknown): GraphSettings["sectionsExpanded"] {
  return normalizeBooleanRecord(value, DEFAULT_SECTIONS_EXPANDED);
}

export function mergeSettingsWithDefaults(partial: Partial<PersistedSettings> | null | undefined): GraphSettings {
  if (!partial) {
    return { ...DEFAULT_GRAPH_SETTINGS, sectionsExpanded: { ...DEFAULT_SECTIONS_EXPANDED } };
  }
  return {
    filter: normalizeFilter(partial.filter),
    display: normalizeDisplay(partial.display),
    force: normalizeForce(partial.force),
    sectionsExpanded: normalizeSections(partial.sectionsExpanded),
  };
}

export function parseSettings(raw: string | null): ParseSettingsResult {
  if (!raw) {
    return { settings: { ...DEFAULT_GRAPH_SETTINGS }, saveDisabled: false };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    if (parsed.version !== SETTINGS_SCHEMA_VERSION) {
      return { settings: { ...DEFAULT_GRAPH_SETTINGS }, saveDisabled: false };
    }
    return { settings: mergeSettingsWithDefaults(parsed), saveDisabled: false };
  } catch {
    return { settings: { ...DEFAULT_GRAPH_SETTINGS }, saveDisabled: false };
  }
}

export function serializeSettings(settings: GraphSettings): string {
  const payload: PersistedSettings = {
    version: SETTINGS_SCHEMA_VERSION,
    filter: settings.filter,
    display: settings.display,
    force: settings.force,
    sectionsExpanded: settings.sectionsExpanded,
  };
  return JSON.stringify(payload);
}

export function trySaveSettings(settings: GraphSettings): { ok: boolean; saveDisabled: boolean } {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings));
    return { ok: true, saveDisabled: false };
  } catch {
    return { ok: false, saveDisabled: true };
  }
}

export function loadSettingsFromStorage(): ParseSettingsResult {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return { settings: { ...DEFAULT_GRAPH_SETTINGS }, saveDisabled: true };
  }
}

export function layoutStorageKey(projectOrRepo: string, commitHash: string): string {
  return `ppi.graph.layout.${projectOrRepo}.${commitHash}`;
}

export function parseLayout(raw: string | null): ParseLayoutResult {
  if (!raw) {
    return { layout: null, saveDisabled: false };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedLayout>;
    if (parsed.version !== LAYOUT_SCHEMA_VERSION || !parsed.nodes) {
      return { layout: null, saveDisabled: false };
    }
    return {
      layout: { version: LAYOUT_SCHEMA_VERSION, nodes: parsed.nodes },
      saveDisabled: false,
    };
  } catch {
    return { layout: null, saveDisabled: false };
  }
}

export function serializeLayout(nodes: PersistedLayout["nodes"]): string {
  const payload: PersistedLayout = { version: LAYOUT_SCHEMA_VERSION, nodes };
  return JSON.stringify(payload);
}

export function trySaveLayout(key: string, nodes: PersistedLayout["nodes"]): { ok: boolean; saveDisabled: boolean } {
  try {
    localStorage.setItem(key, serializeLayout(nodes));
    return { ok: true, saveDisabled: false };
  } catch {
    return { ok: false, saveDisabled: true };
  }
}

export function tryLoadLayout(key: string): ParseLayoutResult {
  try {
    return parseLayout(localStorage.getItem(key));
  } catch {
    return { layout: null, saveDisabled: true };
  }
}

export function tryDeleteLayout(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
