export type DashboardLevel = "module" | "file";
export type DashboardTab = "complexity" | "hotspots";

export type MetricOption = {
  readonly id: string;
  readonly label: string;
  readonly supportedLevels: ReadonlySet<DashboardLevel>;
  readonly defaultEnabled?: boolean;
};

export type DashboardSelection = {
  readonly level: DashboardLevel;
  readonly target: string | null;
  readonly metric: string | null;
  readonly validTargets: readonly string[];
  readonly validMetrics: readonly string[];
  readonly isValid: boolean;
};

export function validMetricsForLevel(
  metrics: readonly MetricOption[],
  level: DashboardLevel,
): readonly string[] {
  return metrics.filter((m) => m.supportedLevels.has(level)).map((m) => m.id);
}

export function resolveMetric(
  current: string | null,
  metrics: readonly MetricOption[],
  level: DashboardLevel,
): string | null {
  const valid = validMetricsForLevel(metrics, level);
  if (!valid.length) return null;
  if (current && valid.includes(current)) return current;
  return valid[0];
}

export function resolveTarget(
  current: string | null,
  validTargets: readonly string[],
): string | null {
  if (!validTargets.length) return null;
  if (current && validTargets.includes(current)) return current;
  return validTargets[0];
}

export function normalizeDashboardSelection({
  level,
  metric,
  target,
  metrics,
  targets,
}: {
  level: DashboardLevel;
  metric: string | null;
  target: string | null;
  metrics: readonly MetricOption[];
  targets: readonly string[];
}): DashboardSelection {
  const validMetrics = validMetricsForLevel(metrics, level);
  const validTargetList = targets.filter((t) => Boolean(t));
  const nextMetric = resolveMetric(metric, metrics, level);
  const nextTarget = resolveTarget(target, validTargetList);
  const hasValidMetric = nextMetric !== null;
  const hasValidTarget = nextTarget !== null;
  return {
    level,
    target: nextTarget,
    metric: nextMetric,
    validTargets: validTargetList,
    validMetrics,
    isValid: hasValidMetric && hasValidTarget,
  };
}
