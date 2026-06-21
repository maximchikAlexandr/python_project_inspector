export { categoryChartFromTimeseries } from "./timeseriesChart";

export type DashboardLevel = "module" | "file";
export type DashboardTab = "complexity" | "size" | "categories" | "hotspots";

export function normalizeDashboardSelection({
  level,
  metric,
  activeTab,
}: {
  level: DashboardLevel;
  metric: string;
  activeTab: DashboardTab;
}): { metric: string; activeTab: DashboardTab } {
  if (level !== "file") {
    return { metric, activeTab };
  }
  return {
    metric: metric === "python_file_count" ? "cyclomatic" : metric,
    activeTab: activeTab === "categories" ? "complexity" : activeTab,
  };
}
