# UI Interaction Contracts: Graph UI Polish and Tables Reorganization

## Top-level navigation

Tabs after this feature:

- `Report`
- `Dashboard`
- `Tables`

Removed from this feature's UI scope if still present:

- `Structure`
- `Analytics`
- `Status`

## Report page contract

The Report page contains:

- commit selector;
- commit date display;
- visible edges indicator if already present;
- graph view;
- graph settings sidebar;
- file map for selected module;
- selected-module details below graph.

The Report page must not contain:

- module code-lines table;
- relations table;
- table-specific shortcuts or preview links;
- old below-graph line-category settings block;
- old below-graph brightness settings block;
- graph sidebar Statistics section.

## Graph settings sidebar contract

Required sections/order:

1. Line categories displayed inside nodes.
2. Module brightness criteria.
3. Filters.
4. Display.
5. Forces.
6. Focus.
7. Zoom and timelapse controls.

The Statistics accordion section is removed.

## Timelapse contract

When Play is pressed:

- If selected commit is the final commit and there are at least two commits, selection moves to the first commit and playback starts.
- If selected commit is not final, playback starts from current commit.
- Playback stops when it reaches final commit.
- Single-commit timelines must be safe and must not enter broken playback.

## Graph viewport contract

During active user interaction:

- Do not auto-recover while the user is actively dragging, panning, or zooming.

After interaction ends:

- If no nodes remain visible in viewport, recover/fit graph to visible area.
- Pan bounds allow graph movement beyond graph bounds with approximately 30-50% viewport padding.

## Tables page contract

The Tables page uses the same selected commit/snapshot as the Report page.

The Tables page contains:

- module code-lines table;
- relations table;
- file drilldown for selected module.

On shared snapshot change:

- reset selected module;
- reset file drilldown;
- preserve sorting;
- preserve visible columns;
- preserve page size.

## Dynamic line-count table contract

- Do not render raw JSON/object text for line-count values.
- Derive one column per non-empty line-count field across all rows in current snapshot.
- Use all rows in the snapshot to decide column visibility, not only locally filtered rows.

## Metrics Dashboard contract

On level change:

1. Recompute valid targets.
2. Recompute valid metrics.
3. Replace invalid target with first valid target.
4. Replace invalid metric with first valid metric.
5. Avoid requests until state is valid.

Aggregation change:

- Selected aggregation must be visible in chart title or metadata.
- Recalculation must be evident even if line shape is nearly identical.

## Commit date contract

- Display selected commit date near commit selector.
- Use browser/user local timezone.
- Use fixed format: `YYYY-MM-DD HH:mm`.
