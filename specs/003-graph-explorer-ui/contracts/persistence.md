# Contract: localStorage Persistence

**Modules**: `frontend/src/components/useGraphSettings.ts` (settings), `frontend/src/components/useGraphLayoutStore.ts` (layouts)

All persistence is browser `localStorage` only (FR-003a/028). No backend, no DuckDB, no cross-device sync.

## Keys

| Purpose | Key | Scope |
|---------|-----|-------|
| Panel settings | `ppi.graph.settings` | Global (one per browser) |
| Saved layout | `ppi.graph.layout.<projectOrRepo>.<commitHash>` | Per project/repository + commit |

- `<projectOrRepo>`: resolve in this order — (1) the report's `project_id` (from `/api/status`); (2) the repository path/`repo_path` from status; (3) `origin + pathname` of the report page. Using `origin + pathname` (not bare origin) avoids collisions between two distinct local projects served from the same origin under different paths. If none resolve to a stable value, layout save/load is disabled with a non-blocking notice (FR-036). (Spec §FR-028, Edge Cases)
- `<commitHash>`: the currently selected commit.

## Serialized schemas

```ts
// ppi.graph.settings
type PersistedSettings = {
  version: 1;
  filter: GraphFilterState;
  display: GraphDisplayState;
  force: GraphForceState;
  sectionsExpanded: Record<"filters" | "display" | "forces" | "focus" | "stats", boolean>;
};

// ppi.graph.layout.<projectOrRepo>.<commitHash>
type PersistedLayout = {
  version: 1;
  nodes: Record<string, { x: number; y: number; pinned: boolean }>;
};
```

## Read/merge rules

- **Settings load**: parse, then merge over `DEFAULT_*` per group so missing/new fields fall back to defaults (forward-compatible). Corrupt/absent value → use defaults silently. (FR-003a/032)
- **Settings save**: write the full merged `PersistedSettings` on every settings change.
- **Version mismatch**: if a stored `version` does not equal the current schema version, treat the value as absent (ignore, no migration); never apply a mismatched layout. (FR-029/FR-036)
- **Layout load** (explicit "Load saved layout"): for each current node, if a saved entry exists apply `x/y` rounded to the saved integer coordinates (and pin via `fx/fy` when `pinned`); unknown current nodes are auto-placed; saved entries with no matching current node are ignored. (FR-029)
- **Layout save** (explicit "Save layout"): snapshot every current node's integer `x/y` and `pinned` flag under the per-commit key. (FR-028)
- **Reset layout** (permanent): clear in-memory `fx/fy`/positions **and delete** the saved per-commit key, then let the simulation recompute. (FR-027)
- **Unpin all** (transient): clear `fx/fy`/pinned flags on in-memory nodes only; do NOT modify any saved key until the analyst explicitly saves again. (FR-027)

## Error handling (FR-036)

- Wrap `JSON.parse` and `localStorage` access; on any failure, behave as if no value was stored (never throw into render).
- **Corrupt/unparseable settings or layout JSON** → treat as absent; use defaults; do not surface an error toast.
- **Version mismatch** → treat as absent (see Read/merge rules); no migration attempt.
- **Storage full/unavailable** (`QuotaExceededError`, private mode, disabled storage) → disable save with a non-blocking notice; in-session settings/layout edits still work until reload.
