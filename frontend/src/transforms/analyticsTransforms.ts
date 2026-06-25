import { filter, map, pipe, sortBy, unique } from "remeda";

import type { EdgeKindPoint, ModuleSnapshot, TimeseriesResponse } from "../api/client";
import { CHART_CATEGORY_COLORS, edgeKindLabel } from "../registry/odooProfile";

export type ComplexityDiffRow = {
  module_name: string;
  cyclomatic_a: number;
  cyclomatic_b: number;
  cognitive_a: number;
  cognitive_b: number;
  jones_a: number;
  jones_b: number;
};

export function buildComplexityDiff(
  modulesA: ReadonlyArray<ModuleSnapshot>,
  modulesB: ReadonlyArray<ModuleSnapshot>,
): readonly ComplexityDiffRow[] {
  const byNameB = new Map(modulesB.map((module) => [module.module_name, module]));
  return pipe(
    modulesA,
    (items) => filter(items, (module) => byNameB.has(module.module_name)),
    (items) =>
      map(items, (module) => {
        const other = byNameB.get(module.module_name)!;
        return {
          module_name: module.module_name,
          cyclomatic_a: module.cyclomatic.median,
          cyclomatic_b: other.cyclomatic.median,
          cognitive_a: module.cognitive.median,
          cognitive_b: other.cognitive.median,
          jones_a: module.jones.median,
          jones_b: other.jones.median,
        };
      }),
    (rows) =>
      sortBy(
        rows,
        (row) => -Math.abs(row.cyclomatic_b - row.cyclomatic_a),
      ),
  );
}

export { categoryChartFromTimeseries } from "./timeseriesChart";

export function fileCountSeriesFromTimeseries(fileCount: TimeseriesResponse): readonly { order: number; value: number }[] {
  return map(fileCount.series[0]?.points ?? [], (point) => ({
    order: point.commit_order,
    value: Number(point.value ?? 0),
  }));
}

export function edgeKindChartFromPoints(edgeKindPoints: ReadonlyArray<EdgeKindPoint>): {
  readonly chartRows: readonly Record<string, number | string>[];
  readonly series: readonly { name: string; label: string; color: string }[];
} {
  const orders = pipe(
    edgeKindPoints,
    (points) => map(points, (point) => point.commit_order),
    (values) => unique(values),
    sortBy((order) => order),
  );
  const kinds = pipe(
    edgeKindPoints,
    (points) => map(points, (point) => point.kind),
    (values) => unique(values),
    sortBy((kind) => kind),
  );
  const chartRows = map(orders, (order) => {
    const row: Record<string, number | string> = { order };
    kinds.forEach((kind) => {
      row[kind] =
        edgeKindPoints.find((point) => point.commit_order === order && point.kind === kind)?.value ?? 0;
    });
    return row;
  });
  const series = kinds.map((kind, index) => ({
    name: kind,
    label: edgeKindLabel(kind),
    color: CHART_CATEGORY_COLORS[index % CHART_CATEGORY_COLORS.length],
  }));
  return { chartRows, series };
}

export function moduleSelectOptions(names: ReadonlyArray<string>): readonly { value: string; label: string }[] {
  return map(names, (name) => ({ value: name, label: name }));
}
