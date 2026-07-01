export type DashboardLevel = "module" | "file";
export type DashboardTab = "complexity" | "hotspots";

export function normalizeDashboardSelection({
  metric,
  activeTab,
}: {
  level: DashboardLevel;
  metric: string;
  activeTab: DashboardTab;
}): { metric: string; activeTab: DashboardTab } {
  return { metric, activeTab };
}
