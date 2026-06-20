export type StatusResponse = {
  project_id: string | null;
  branch: string | null;
  schema_version: number;
  expected_schema_version: number;
  schema_compatible: boolean;
  store_present: boolean;
  writer_active: boolean;
  commit_count: number;
  last_run: {
    run_id: string;
    branch: string;
    mode: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    commits_total: number;
    commits_succeeded: number;
    commits_failed: number;
  } | null;
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

export type TimeseriesSeries = {
  name: string;
  points: TimeseriesPoint[];
};

export type TimeseriesResponse = {
  level: "module" | "file";
  metric: string;
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

export type EdgeBreakdown = {
  model_reuse: number;
  extension_or_method: number;
  view: number;
  field_property: number;
  total: number;
};

export type EdgeRow = {
  source: string;
  target: string;
  score: number;
  kinds: Record<string, number>;
  kind_occurrence_count?: number;
  evidence_count?: number;
  breakdown?: EdgeBreakdown;
  commit_hash: string;
};

export type EdgesResponse = {
  commit_hash: string | null;
  edges: EdgeRow[];
};

export type StructurePoint = {
  commit_order: number;
  commit_hash: string;
  edge_count: number;
  total_score: number;
};

export type StructureTimeseriesResponse = {
  points: StructurePoint[];
};

export type MetricDistribution = {
  count: number;
  mean: number;
  median: number;
  p95: number;
  max: number;
};

export type ModuleSnapshot = {
  module_name: string;
  total_lines: number;
  line_categories: Record<string, number>;
  python_file_count: number;
  cyclomatic: MetricDistribution;
  cognitive: MetricDistribution;
  jones: MetricDistribution;
  declared_models: string[];
  inherited_models: string[];
  score_in: number;
  score_out: number;
  python_complexity_parse_errors: number;
  manifest_depends?: string[];
  files?: FileSnapshot[];
};

export type FileSnapshot = {
  module_name: string;
  relative_path: string;
  top_folder: string;
  category: string;
  lines: number;
  function_count: number;
  jones_line_count: number;
  cyclomatic: MetricDistribution;
  cognitive: MetricDistribution;
  jones: MetricDistribution;
  parse_error: string | null;
};

export type GraphNode = {
  module_name: string;
  total_lines: number;
  line_categories: Record<string, number>;
  python_file_count: number;
  method_count: number;
  cyclomatic_median: number;
  cognitive_median: number;
  jones_median: number;
  score_in: number;
  score_out: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  score: number;
  breakdown: EdgeBreakdown;
};

export type GraphResponse = {
  commit_hash: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type EvidenceRow = {
  kind: string;
  file_path: string;
  line: number;
  detail: string;
};

export type EdgePointsResponse = {
  commit_hash: string;
  source: string;
  target: string;
  breakdown: EdgeBreakdown;
  points: { category: string; points: number; why_points?: string }[];
  why_points?: Record<string, string>;
  evidence: EvidenceRow[];
};

export type FailureRow = {
  commit_hash: string | null;
  file_path: string | null;
  error_text: string;
};

export type FailuresResponse = {
  commit_hash: string;
  failures: FailureRow[];
};

export type RelationsDiffChange = {
  source: string;
  target: string;
  change: "added" | "removed";
  score_a: number | null;
  score_b: number | null;
};

export type RelationsDiffResponse = {
  commit_a: string;
  commit_b: string;
  changes: RelationsDiffChange[];
};

export type EdgeKindPoint = {
  commit_order: number;
  commit_hash: string;
  kind: string;
  value: number;
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${path} -> ${response.status}: ${detail}`);
  }
  return response.json() as Promise<T>;
}

export function fetchStatus(): Promise<StatusResponse> {
  return fetchJson("/api/status");
}

export function fetchCommits(): Promise<CommitRow[]> {
  return fetchJson("/api/commits");
}

export function fetchTimeseries(params: {
  level: "module" | "file";
  metric: string;
  name?: string;
  agg?: string;
}): Promise<TimeseriesResponse> {
  const query = new URLSearchParams({
    level: params.level,
    metric: params.metric,
  });
  if (params.name) {
    query.set("name", params.name);
  }
  if (params.agg) {
    query.set("agg", params.agg);
  }
  return fetchJson(`/api/metrics/timeseries?${query.toString()}`);
}

export function fetchHotspots(params: {
  level: "module" | "file";
  metric: string;
  by: "value" | "growth";
  limit?: number;
  agg?: string;
}): Promise<HotspotsResponse> {
  const query = new URLSearchParams({
    level: params.level,
    metric: params.metric,
    by: params.by,
    limit: String(params.limit ?? 20),
  });
  if (params.agg) {
    query.set("agg", params.agg);
  }
  return fetchJson(`/api/hotspots?${query.toString()}`);
}

export function fetchCatalog(level: "module" | "file"): Promise<{ level: string; names: string[] }> {
  return fetchJson(`/api/catalog?level=${level}`);
}

export function fetchEdges(commit?: string, includeZeroScore = false): Promise<EdgesResponse> {
  const query = new URLSearchParams({
    include_zero_score: String(includeZeroScore),
  });
  if (commit) {
    query.set("commit", commit);
  }
  return fetchJson(`/api/edges?${query.toString()}`);
}

export function fetchStructureTimeseries(includeZeroScore = false): Promise<StructureTimeseriesResponse> {
  return fetchJson(`/api/structure/timeseries?include_zero_score=${includeZeroScore}`);
}

export function fetchSnapshotModules(commit?: string): Promise<{ commit_hash: string; modules: ModuleSnapshot[] }> {
  const query = commit ? `?commit=${commit}` : "";
  return fetchJson(`/api/snapshot/modules${query}`);
}

export function fetchSnapshotFiles(commit?: string, module?: string): Promise<{ commit_hash: string; files: FileSnapshot[] }> {
  const query = new URLSearchParams();
  if (commit) {
    query.set("commit", commit);
  }
  if (module) {
    query.set("module", module);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchJson(`/api/snapshot/files${suffix}`);
}

export function fetchGraph(commit?: string, includeZeroScore = false): Promise<GraphResponse> {
  const query = new URLSearchParams({ include_zero_score: String(includeZeroScore) });
  if (commit) {
    query.set("commit", commit);
  }
  return fetchJson(`/api/graph?${query.toString()}`);
}

export function fetchEdgePointsBatch(
  pairs: { source: string; target: string }[],
  commit?: string,
  includeZeroScore = false,
): Promise<{ commit_hash: string; edges: EdgePointsResponse[]; missing: { source: string; target: string }[] }> {
  return fetchJson("/api/edge-points/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairs,
      commit: commit ?? null,
      include_zero_score: includeZeroScore,
    }),
  });
}

export function fetchFailures(commit?: string): Promise<FailuresResponse> {
  const query = commit ? `?commit=${commit}` : "";
  return fetchJson(`/api/failures${query}`);
}

export function fetchRelationsDiff(commitA: string, commitB: string): Promise<RelationsDiffResponse> {
  return fetchJson(`/api/relations/diff?commit_a=${commitA}&commit_b=${commitB}`);
}

export function fetchEdgeKindTimeseries(kind?: string): Promise<{ points: EdgeKindPoint[] }> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return fetchJson(`/api/edge-kinds/timeseries${query}`);
}
