/**
 * Zod schemas validating unknown JSON at the API/transport boundary (PPI-022/030/034).
 *
 * The frontend receives raw JSON from `fetch` (HTTP) or `postMessage` (webview).
 * Before any of it reaches selectors/components, it must be parsed here so a
 * malformed backend/bridge response is a typed `DecodeError`, not a silent
 * `undefined` crash later.
 */
import { z } from "zod";

export const EdgeBreakdownSchema = z.record(z.string(), z.number());

const readonlyStringRecord = z.record(z.string(), z.number());

export const UiOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  default_enabled: z.boolean().optional(),
});

export const UiMetricOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  unit: z.string().optional(),
  format: z.string().optional(),
  default_enabled: z.boolean().optional(),
});

export const UiColumnDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string().optional(),
  metric_id: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
});

export const UiTableDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  columns: z.array(UiColumnDefinitionSchema),
});

export const UiGraphConfigSchema = z.object({
  edge_types: z.array(UiOptionSchema),
  line_categories: z.array(UiOptionSchema),
  brightness_metrics: z.array(UiMetricOptionSchema),
  node_size_metrics: z.array(UiMetricOptionSchema),
  link_thickness_metrics: z.array(UiMetricOptionSchema),
});

export const UiConfigResponseSchema = z.object({
  dashboard_metrics: z.array(UiMetricOptionSchema),
  aggregations: z.array(UiOptionSchema),
  tables: z.array(UiTableDefinitionSchema),
  graph: UiGraphConfigSchema,
});

export const GenericTableRowSchema = z.object({
  id: z.string().optional(),
  cells: z.record(z.string(), z.unknown()),
  actions: z.record(z.string(), z.boolean()).optional(),
});

export const GenericTableResponseSchema = z.object({
  commit_hash: z.string(),
  rows: z.array(GenericTableRowSchema),
});

export const RelationRowSchema = z.object({
  source_id: z.string(),
  source_label: z.string(),
  target_id: z.string(),
  target_label: z.string(),
  relation_type_id: z.string(),
  relation_type_label: z.string(),
  strength_metric_id: z.string().optional(),
  strength_metric_label: z.string().optional(),
  strength_value: z.number().optional(),
});

export const RelationsResponseSchema = z.object({
  commit_hash: z.string(),
  relations: z.array(RelationRowSchema),
});

export const ProjectInfoResponseSchema = z.object({
  project_id: z.string().nullable(),
  branch: z.string().nullable(),
  commit_count: z.number(),
  schema_version: z.number(),
  store_present: z.boolean(),
});

export const CommitRowSchema = z.object({
  commit_hash: z.string(),
  commit_order: z.number(),
  authored_at: z.string().nullable(),
  summary: z.string().nullable(),
});

export const commitsResponseSchema = z.array(CommitRowSchema);

export const GraphNodeSchema = z.object({
  module_name: z.string(),
  total_lines: z.number(),
  metrics: z.record(z.string(), z.number()).optional(),
  line_counts: z.record(z.string(), z.number()),
});

export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  score: z.number(),
  breakdown: EdgeBreakdownSchema.optional(),
  kinds: readonlyStringRecord.optional(),
  kind_occurrence_count: z.number().optional(),
  commit_hash: z.string().optional(),
});

export const GraphResponseSchema = z.object({
  commit_hash: z.string(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

export const TimeseriesPointSchema = z.object({
  commit_order: z.number(),
  commit_hash: z.string(),
  value: z.number().nullable(),
});

export const TimeseriesSeriesSchema = z.object({
  name: z.string(),
  points: z.array(TimeseriesPointSchema),
});

export const TimeseriesResponseSchema = z.object({
  level: z.enum(["module", "file"]),
  metric_id: z.string(),
  agg: z.string(),
  series: z.array(TimeseriesSeriesSchema),
});

export const HotspotItemSchema = z.object({
  name: z.string(),
  current: z.number(),
  first: z.number().nullable().optional(),
  growth: z.number().nullable().optional(),
});

export const HotspotsResponseSchema = z.object({
  by: z.enum(["value", "growth"]),
  items: z.array(HotspotItemSchema),
});

/** RPC response envelope (webview bridge). Discriminated on `status`:
 * exactly one of `result`/`error`, never both. */
export const ResponseEnvelopeSchema = z.discriminatedUnion("status", [
  z.object({
    kind: z.literal("response"),
    status: z.literal("ok"),
    id: z.number(),
    result: z.unknown(),
  }),
  z.object({
    kind: z.literal("response"),
    status: z.literal("error"),
    id: z.number(),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);