# Quickstart: Validate Graph UI Polish and Tables Reorganization

This quickstart describes validation scenarios for a local development checkout.

## Prerequisites

- Project dependencies installed.
- Analysis data available for a repository with multiple commits.
- Dashboard server running.
- Frontend dev server or bundled dashboard available.

## Suggested validation commands

From the project root, use the project's normal development commands. Typical commands may include:

```bash
uv run ppi analyze --repo <repo-path>
uv run ppi serve --repo <repo-path>
cd frontend && npm test
cd frontend && npm run build
```

Adapt commands to the current repository scripts if they differ.

## Manual smoke validation log

Record pass/fail notes for each scenario below after implementation lands.

## Responsive/readability validation

- Snapshot header is readable in compact layout below 900 px viewport width.
- Wide tables are horizontally navigable without obscuring the commit selector,
  commit date, or visible-edge count at 900 px viewport width and above.

## Scenario 1: Navigation

1. Open the dashboard.
2. Confirm top-level tabs show `Report`, `Dashboard`, and `Tables`.
3. Confirm large module/relation tables are not visible on Report.
4. Open Tables and confirm table data appears for the currently selected commit.

Expected result: Tables are accessible only from the top-level Tables tab, not from shortcuts on Report.

## Scenario 2: Graph sidebar

1. Open Report.
2. Inspect right graph settings sidebar.
3. Confirm `Statistics` section is absent.
4. Confirm `Line categories` section appears before `Brightness criteria`.
5. Confirm old below-graph settings blocks are absent.

Expected result: graph settings are centralized in the sidebar and below-graph area is simplified.

## Scenario 3: Edge labels

1. Open graph filter section.
2. Inspect edge-type filter names.
3. Confirm labels are readable English labels, not raw `snake_case` keys.
4. If a backend label is missing, confirm fallback label is readable.

Expected result: labels such as `Model reuse` appear instead of `model_reuse`.

## Scenario 4: Timelapse from final commit

1. Select the final commit in the timeline.
2. Press Play.
3. Observe selected commit.

Expected result: playback starts from the first commit and proceeds forward.

## Scenario 5: Graph viewport recovery

1. Pan/zoom the graph until no nodes are visible.
2. Release the interaction.
3. Observe viewport.

Expected result: graph recovers to a visible area after the gesture ends.

## Scenario 6: Dynamic line-count columns

1. Open Tables.
2. Inspect module code-lines table.
3. Confirm line-count fields are separate columns.
4. Confirm no cell displays a raw object such as `{ "python_lines": ... }`.

Expected result: line counts render as dedicated columns.

## Scenario 7: Metrics Dashboard validity

1. Open Dashboard.
2. Select Module level and a module target.
3. Switch level to File.
4. Observe target and metric selectors.

Expected result: target and metric change to valid file-level values before any request is sent.

## Scenario 8: Aggregation feedback

1. Open Dashboard.
2. Change aggregation between Mean, Median, P95, and Max.
3. Observe chart title or metadata.

Expected result: selected aggregation is visibly reflected even when the plotted line is nearly unchanged.

## Scenario 9: Commit date display

1. Open Report.
2. Select a commit.
3. Inspect commit selector area.

Expected result: selected commit date appears near the selector in `YYYY-MM-DD HH:mm` format using local timezone.

## Scenario 10: File detail cleanup

1. Select a module.
2. Select or hover a file in the treemap.
3. Inspect file detail panel.

Expected result: parse error, top folder, category, and lower-row lines metadata are not shown in this panel.
