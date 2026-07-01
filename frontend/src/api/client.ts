export type UiOption = {
  id: string;
  label: string;
  default_enabled?: boolean;
};

export type UiMetricOption = {
  id: string;
  label: string;
  unit?: string;
  format?: string;
  default_enabled?: boolean;
};

export type UiColumnDefinition = {
  key: string;
  label: string;
  type?: string;
  metric_id?: string | null;
  width?: number | null;
};

export type UiTableDefinition = {
  key: string;
  label: string;
  columns: UiColumnDefinition[];
};

export type UiGraphConfig = {
  edge_types: UiOption[];
  line_categories: UiOption[];
  brightness_metrics: UiMetricOption[];
  node_size_metrics: UiMetricOption[];
  link_thickness_metrics: UiMetricOption[];
};

export type UiConfigResponse = {
  dashboard_metrics: UiMetricOption[];
  aggregations: UiOption[];
  tables: UiTableDefinition[];
  graph: UiGraphConfig;
};

export type GenericTableRow = {
  id?: string;
  cells: Record<string, unknown>;
  actions?: Record<string, boolean>;
};

export type GenericTableResponse = {
  commit_hash: string;
  rows: GenericTableRow[];
};

export type RelationRow = {
  source_id: string;
  source_label: string;
  target_id: string;
  target_label: string;
  relation_type_id: string;
  relation_type_label: string;
  strength_metric_id?: string;
  strength_metric_label?: string;
  strength_value?: number;
};

export type RelationsResponse = {
  commit_hash: string;
  relations: RelationRow[];
};

export type ProjectInfoResponse = {
  project_id: string | null;
  branch: string | null;
  commit_count: number;
  schema_version: number;
  store_present: boolean;
};

export type CommitRow = {
  commit_hash: string;
  commit_order: number;
  authored_at: string | null;
  summary: string | null;
};

export type TimeseriesPoint = {
  commit_order: number;
  commit_hash: string;
  value: number | null;
};

type TimeseriesSeries = {
  name: string;
  points: TimeseriesPoint[];
};

export type TimeseriesResponse = {
  level: "module" | "file";
  metric_id: string;
  agg: string;
  series: TimeseriesSeries[];
};

export type HotspotItem = {
  name: string;
  current: number;
  first?: number | null;
  growth?: number | null;
};

export type HotspotsResponse = {
  by: "value" | "growth";
  items: HotspotItem[];
};

export type GraphNode = {
  module_name: string;
  total_lines: number;
  metrics?: Record<string, number>;
  line_counts: Record<string, number>;
};

export type GraphEdge = {
  source: string;
  target: string;
  score: number;
  breakdown?: Record<string, number>;
  kinds?: Record<string, number>;
  kind_occurrence_count?: number;
  commit_hash?: string;
};

export type GraphResponse = {
  commit_hash: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

import { getDataSource } from "./dataSource";
import { DecodeErrorRaised } from "../domain/errors";
import * as S from "./schemas";

function ds() {
  return getDataSource();
}

/** Parse unknown JSON through a zod schema; raise a typed `DecodeError` on failure (PPI-030/034). */
function validate<T>(schema: { safeParse(d: unknown): { success: boolean; data?: T; error?: { message: string } } }, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new DecodeErrorRaised({
      kind: "decode",
      reason: `${label}: ${result.error?.message ?? "schema validation failed"}`,
      received: data,
    });
  }
  return result.data as T;
}

export function fetchUiConfig(): Promise<UiConfigResponse> {
  return ds().get<unknown>("ui/config").then((d) => validate(S.UiConfigResponseSchema, d, "ui/config"));
}

export function fetchProjectInfo(): Promise<ProjectInfoResponse> {
  return ds().get<unknown>("project/info").then((d) => validate(S.ProjectInfoResponseSchema, d, "project/info"));
}

export function fetchCommits(): Promise<CommitRow[]> {
  return ds().get<unknown>("commits").then((d) => validate(S.commitsResponseSchema, d, "commits"));
}

export function fetchTimeseries(params: {
  level: "module" | "file";
  metric_id: string;
  name?: string;
  agg?: string;
}): Promise<TimeseriesResponse> {
  return ds()
    .get<unknown>("metrics/timeseries", {
      level: params.level,
      metric_id: params.metric_id,
      name: params.name,
      agg: params.agg,
    })
    .then((d) => validate(S.TimeseriesResponseSchema, d, "metrics/timeseries"));
}

export function fetchHotspots(params: {
  level: "module" | "file";
  metric_id: string;
  by: "value" | "growth";
  limit?: number;
  agg?: string;
}): Promise<HotspotsResponse> {
  return ds()
    .get<unknown>("hotspots", {
      level: params.level,
      metric_id: params.metric_id,
      by: params.by,
      limit: params.limit,
      agg: params.agg,
    })
    .then((d) => validate(S.HotspotsResponseSchema, d, "hotspots"));
}

export function fetchGraph(commit?: string, includeZeroScore = false): Promise<GraphResponse> {
  return ds()
    .get<unknown>("graph", { commit, include_zero_score: includeZeroScore })
    .then((d) => validate(S.GraphResponseSchema, d, "graph"));
}

export function fetchSnapshotTableModules(commit?: string): Promise<GenericTableResponse> {
  return ds()
    .get<unknown>("snapshot/table/modules", { commit })
    .then((d) => validate(S.GenericTableResponseSchema, d, "snapshot/table/modules"));
}

export function fetchSnapshotTableFiles(commit?: string, module?: string): Promise<GenericTableResponse> {
  return ds()
    .get<unknown>("snapshot/table/files", { commit, module })
    .then((d) => validate(S.GenericTableResponseSchema, d, "snapshot/table/files"));
}

export function fetchSnapshotRelations(commit?: string): Promise<RelationsResponse> {
  return ds()
    .get<unknown>("snapshot/relations", { commit })
    .then((d) => validate(S.RelationsResponseSchema, d, "snapshot/relations"));
}
