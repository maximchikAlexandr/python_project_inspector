import { map, pipe, sortBy, unique } from "remeda";

import type { TimeseriesResponse } from "../api/client";
import { CHART_CATEGORY_COLORS, LINE_CATEGORIES } from "../registry/odooProfile";

export function categoryChartFromTimeseries(categories: TimeseriesResponse): {
  chartRows: Record<string, number | string>[];
  series: { name: string; label: string; color: string }[];
} {
  const orders = pipe(
    categories.series.flatMap((series) => map(series.points, (point) => point.commit_order)),
    unique(),
    sortBy((order) => order),
  );
  const chartRows = map(orders, (order) => {
    const row: Record<string, number | string> = { order };
    categories.series.forEach((series) => {
      const key = series.name.split("/").pop() ?? series.name;
      row[key] = Number(series.points.find((point) => point.commit_order === order)?.value ?? 0);
    });
    return row;
  });
  const series = map(LINE_CATEGORIES, ({ key, label }, index) => ({
    name: key,
    label,
    color: CHART_CATEGORY_COLORS[index % CHART_CATEGORY_COLORS.length],
  }));
  return { chartRows, series };
}
