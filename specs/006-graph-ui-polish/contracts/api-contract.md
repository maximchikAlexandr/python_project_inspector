# API Contract Notes: Graph UI Polish and Tables Reorganization

This file describes API expectations for this feature. It is not a complete OpenAPI document.

## Commit timeline

### `GET /api/commits`

Purpose: provide ordered commits for snapshot selection, timelapse, and commit date display.

Required behavior for this feature:

- Each commit row must include a stable commit identifier.
- Each commit row should include timestamp metadata sufficient to render selected commit date.
- The frontend renders timestamp in browser local timezone using `YYYY-MM-DD HH:mm`.

Compatibility:

- If timestamp already exists under a different field name, frontend may adapt through the client/transform layer.
- If timestamp is missing, backend should expose it rather than adding a separate endpoint.

## UI config

### `GET /api/ui/config`

Purpose: provide UI metadata for labels and selection options.

Required behavior for this feature:

- Expose graph line-category options.
- Expose graph brightness criteria.
- Expose edge type metadata with optional readable labels.
- Expose dashboard metric options with enough information to determine valid level/metric combinations, or provide another existing catalog source for that validation.
- Expose aggregation options.

Edge type label policy:

- Backend/config label wins.
- If label is absent, frontend generates readable fallback from key.

## Graph

### `GET /api/graph`

Purpose: provide graph nodes and edges for the selected commit.

Required behavior for this feature:

- Must continue to provide edge type keys used by filters.
- Should remain compatible with `GET /api/ui/config` edge metadata.
- No new graph analysis data is required.

## Snapshot tables

### `GET /api/snapshot/table/modules`

Purpose: provide module table rows for the current snapshot.

Required behavior for this feature:

- Provide rows containing module identity and line-count data.
- Line-count object values must be transformable into dynamic columns.
- Backend may provide columns directly; frontend may derive dynamic line-count columns from all rows if needed.

### `GET /api/snapshot/table/files`

Purpose: provide file table rows for module drilldown.

Required behavior for this feature:

- Support the current snapshot.
- Support optional module filtering if available.
- Frontend must not require raw file table data on the Report page after tables move to the Tables page, except where file treemap still needs selected-module file data.

### `GET /api/snapshot/relations`

Purpose: provide relations table rows for the current snapshot.

Required behavior for this feature:

- Relations table should use readable labels for relation/edge types where visible.
- Data is displayed on the Tables page, not on the Report page.

## Metrics dashboard

### `GET /api/metrics/timeseries`

Purpose: provide chart timeseries for a valid level/target/metric/aggregation combination.

Required behavior for this feature:

- UI must avoid sending invalid combinations.
- UI normalizes the level/target/metric selection through `normalizeDashboardSelection`
  and only fires requests when the resulting `isValid` flag is true.
- `supported_levels` on each `dashboard_metrics` row tells the UI which metrics
  are valid for a given `level` (module, file, or both).
- Backend should continue returning appropriate errors for invalid external/manual requests.

### `GET /api/hotspots`

Purpose: provide hotspots for valid level/metric/aggregation combinations.

Required behavior for this feature:

- UI must avoid requesting metrics unsupported by selected level.
- Backend should continue returning appropriate errors for invalid external/manual requests.

### `GET /api/ui/config`

`dashboard_metrics` rows now include `supported_levels` (array of `"module"`,
`"file"`), derived from each metric catalog entry's reader method availability.
The frontend uses this list to filter valid metrics for the active level and
to replace an invalid metric with the first valid one when the level changes.

### Aggregation feedback

Chart titles and metadata use the selected aggregation label so a recalculation
is visible even when the plotted line is visually similar.
