# Data Model: Graph UI Polish and Tables Reorganization

This feature mostly changes UI placement and interaction state. It does not introduce new persisted analysis entities.

## Entity: App Navigation State

Represents active top-level page and shared snapshot selection.

Fields:

- `activeTab`: one of `report`, `dashboard`, `tables`.
- `selectedCommit`: selected commit/snapshot identifier shared between Report and Tables.
- `pendingNavigation`: optional requested navigation state.

Validation:

- `selectedCommit` must be either null while commits load or one of the known commit identifiers.
- `tables` uses the same `selectedCommit` as `report`; it does not own a separate commit selector.

State transitions:

- On app load: default to Report and latest commit when commit list is available.
- On commit change: update shared selected commit and notify dependent pages.
- On tab change: retain shared selected commit.

## Entity: Table Interaction State

Represents local state of the Tables page.

Fields:

- `selectedTable`: active table area, if the page has internal sections.
- `selectedModule`: module selected for file drilldown, nullable.
- `drilldownLevel`: `modules` or `files`.
- `sorting`: table sorting preference.
- `visibleColumns`: set of visible column identifiers.
- `pageSize`: preferred page size.

Validation:

- `selectedModule` is valid only if it exists in the current snapshot's module table.
- `drilldownLevel = files` requires a valid `selectedModule`.

State transitions:

- On shared snapshot change: reset `selectedModule` and `drilldownLevel` to module level.
- On shared snapshot change: preserve `sorting`, `visibleColumns`, and `pageSize`.
- On module drilldown action: set `selectedModule` and `drilldownLevel = files`.
- On return action: clear `selectedModule` and set `drilldownLevel = modules`.

## Entity: Dynamic Table Column

Represents a backend-described or frontend-derived table column.

Fields:

- `id`: stable column identifier.
- `label`: user-facing column label.
- `type`: value type such as text, number, boolean, metric, date.
- `source`: cell path or derivation source.
- `visibleByDefault`: whether column is initially visible.
- `sortable`: whether sorting is allowed.

Validation:

- `id` must be unique within a table.
- Dynamic line-count columns must be included only when the field has at least one non-empty value across all rows in the current snapshot.

## Entity: Line Count Field

Represents one count of lines for a category.

Fields:

- `id`: stable line-count key.
- `label`: user-facing label.
- `value`: numeric count.

Validation:

- Empty or missing values do not create a dynamic table column unless another row in the current snapshot has a non-empty value for the same field.

## Entity: Edge Type Display Metadata

Represents display metadata for a graph/relation edge type.

Fields:

- `key`: stable internal edge-type key.
- `label`: optional backend/config display label.
- `fallbackLabel`: readable label generated from key when label is absent.
- `color`: optional display color if already supported.

Validation:

- UI must prefer `label` when present.
- UI must generate `fallbackLabel` when `label` is absent.
- UI must not show raw `snake_case` in normal edge-type filter labels.

## Entity: Timelapse State

Represents timeline playback controls.

Fields:

- `selectedCommit`: current commit/snapshot identifier.
- `playing`: boolean.
- `speed`: playback delay or multiplier.
- `commitIndex`: index of selected commit in ordered commits.
- `commitCount`: total commit count.

State transitions:

- Play from middle/first commit: set `playing = true` and advance normally.
- Play from final commit: set selected commit to first commit and set `playing = true`.
- Next at final commit: stop playback.
- Single-commit timeline: play is disabled or remains safe with no movement.

## Entity: Graph Viewport State

Represents graph camera/viewport behavior.

Fields:

- `transform`: current pan/zoom transform.
- `viewportBounds`: visible rectangle.
- `graphBounds`: bounding box of visible graph nodes.
- `interactionActive`: whether pan/drag/zoom is active.
- `paddingRatio`: allowed pan padding, approximately 0.3-0.5 viewport size.

State transitions:

- During interaction: update transform without auto-recovery.
- On interaction end: determine whether at least one node remains visible.
- If no nodes visible: recover/fit graph to visible area.
- Apply pan bounds with permissive padding.

## Entity: Metric Selector State

Represents Metrics Dashboard selections.

Fields:

- `level`: `module` or `file`.
- `target`: selected module name or file path.
- `metric`: selected metric identifier.
- `aggregation`: selected aggregation identifier.
- `validTargets`: targets valid for current level.
- `validMetrics`: metrics valid for current level.
- `isValid`: whether current combination can be queried.

Validation:

- Module level requires module targets.
- File level requires file path targets.
- Metrics must be valid for selected level.
- Query requests are allowed only when `isValid = true`.

State transitions:

- On level change: recompute valid targets and valid metrics.
- If target invalid: replace with first valid target or null unavailable state.
- If metric invalid: replace with first valid metric or null unavailable state.
- Do not request timeseries/hotspots while invalid.

## Entity: Commit Date Display

Represents selected commit timestamp display.

Fields:

- `commitHash`: selected commit identifier.
- `timestamp`: raw timestamp from commit metadata.
- `displayTimezone`: browser/user local timezone.
- `displayValue`: formatted `YYYY-MM-DD HH:mm` string.

Validation:

- Display value must be shown near commit selector when timestamp is available.
- If timestamp is unavailable, UI should degrade gracefully without breaking commit selection.
