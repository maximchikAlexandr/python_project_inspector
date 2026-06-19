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

export type EdgeRow = {
  source: string;
  target: string;
  score: number;
  kinds: Record<string, number>;
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

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
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
}): Promise<HotspotsResponse> {
  const query = new URLSearchParams({
    level: params.level,
    metric: params.metric,
    by: params.by,
    limit: String(params.limit ?? 20),
  });
  return fetchJson(`/api/hotspots?${query.toString()}`);
}

export function fetchCatalog(level: "module" | "file"): Promise<{ level: string; names: string[] }> {
  return fetchJson(`/api/catalog?level=${level}`);
}

export function fetchEdges(commit?: string, minScore = 1): Promise<EdgesResponse> {
  const query = new URLSearchParams({ min_score: String(minScore) });
  if (commit) {
    query.set("commit", commit);
  }
  return fetchJson(`/api/edges?${query.toString()}`);
}

export function fetchStructureTimeseries(): Promise<StructureTimeseriesResponse> {
  return fetchJson("/api/structure/timeseries");
}
