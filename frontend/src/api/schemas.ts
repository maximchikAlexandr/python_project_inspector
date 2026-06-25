/**
 * Zod schemas validating unknown JSON at the API/transport boundary (PPI-022/030/034).
 *
 * The frontend receives raw JSON from `fetch` (HTTP) or `postMessage` (webview).
 * Before any of it reaches selectors/components, it must be parsed here so a
 * malformed backend/bridge response is a typed `DecodeError`, not a silent
 * `undefined` crash later.
 */
import { z } from "zod";

import type { EdgeKind, GraphBreakdownKind, LineCategory } from "../domain/domain";

const edgeKindEnum = z.enum([
  "python__inherit",
  "python_method_call",
  "python_private_method_call",
  "python_many2one",
  "python_one2many",
  "python_many2many",
  "python_related",
  "python_api_depends",
  "python_api_onchange",
  "python_api_constrains",
  "python_env_model",
  "python_field_property_access",
  "security_ir_rule_model_ref",
  "security_ir_rule_ref",
  "security_xml_ref",
  "security_csv_ref",
  "xml_inherit_id",
  "xml_ref",
  "xml_percent_ref",
  "manifest_depends",
]);

const graphBreakdownKindEnum = z.enum(["model_reuse", "extension_or_method", "view", "field_property"]);

const lineCategoryEnum = z.enum([
  "python_lines",
  "js_lines",
  "python_test_lines",
  "xml_lines",
  "css_lines",
  "html_lines",
]);

/** Coerce an unknown into a typed `EdgeKind`, or `null` if unknown. */
export function edgeKindOf(value: unknown): EdgeKind | null {
  const parsed = edgeKindEnum.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Coerce an unknown into a typed `GraphBreakdownKind`, or `null` if unknown. */
export function graphBreakdownKindOf(value: unknown): GraphBreakdownKind | null {
  const parsed = graphBreakdownKindEnum.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Coerce an unknown into a typed `LineCategory`, or `null` if unknown. */
export function lineCategoryOf(value: unknown): LineCategory | null {
  const parsed = lineCategoryEnum.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const DistributionSchema = z.object({
  count: z.number(),
  mean: z.number(),
  median: z.number(),
  p95: z.number(),
  max: z.number(),
});

export const EdgeBreakdownSchema = z.object({
  model_reuse: z.number(),
  extension_or_method: z.number(),
  view: z.number(),
  field_property: z.number(),
  total: z.number(),
});

const readonlyStringRecord = z.record(z.string(), z.number());

export const EvidenceRowSchema = z.object({
  kind: z.string(),
  file_path: z.string(),
  line: z.number(),
  detail: z.string(),
  source_quote: z.string().optional(),
  category: z.string().optional(),
});

export const CommitRowSchema = z.object({
  commit_hash: z.string(),
  commit_order: z.number(),
  authored_at: z.string().nullable(),
  summary: z.string().nullable(),
});

export const commitsResponseSchema = z.array(CommitRowSchema);

export const ModuleSnapshotSchema = z.object({
  module_name: z.string(),
  total_lines: z.number(),
  line_categories: readonlyStringRecord,
  python_file_count: z.number(),
  cyclomatic: DistributionSchema,
  cognitive: DistributionSchema,
  jones: DistributionSchema,
  declared_models: z.array(z.string()),
  inherited_models: z.array(z.string()),
  score_in: z.number(),
  score_out: z.number(),
  python_complexity_parse_errors: z.number(),
  manifest_depends: z.array(z.string()).optional(),
  files: z.array(z.any()).optional(),
});

export const FileSnapshotSchema = z.object({
  module_name: z.string(),
  relative_path: z.string(),
  top_folder: z.string(),
  category: z.string(),
  lines: z.number(),
  function_count: z.number(),
  jones_line_count: z.number(),
  cyclomatic: DistributionSchema,
  cognitive: DistributionSchema,
  jones: DistributionSchema,
  parse_error: z.string().nullable(),
});

export const GraphNodeSchema = z.object({
  module_name: z.string(),
  total_lines: z.number(),
  line_categories: readonlyStringRecord,
  python_file_count: z.number(),
  method_count: z.number(),
  cyclomatic_median: z.number(),
  cognitive_median: z.number(),
  jones_median: z.number(),
  score_in: z.number(),
  score_out: z.number(),
});

export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  score: z.number(),
  breakdown: EdgeBreakdownSchema,
  kinds: readonlyStringRecord.optional(),
  kind_occurrence_count: z.number().optional(),
  evidence_count: z.number().optional(),
  commit_hash: z.string().optional(),
});

export const GraphResponseSchema = z.object({
  commit_hash: z.string(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

export const SnapshotModulesResponseSchema = z.object({
  commit_hash: z.string(),
  modules: z.array(ModuleSnapshotSchema),
});

export const SnapshotFilesResponseSchema = z.object({
  commit_hash: z.string(),
  files: z.array(FileSnapshotSchema),
});

export const FailureRowSchema = z.object({
  commit_hash: z.string().nullable(),
  file_path: z.string().nullable(),
  error_text: z.string(),
});

export const FailuresResponseSchema = z.object({
  commit_hash: z.string(),
  failures: z.array(FailureRowSchema),
});

export const EdgesResponseSchema = z.object({
  commit_hash: z.string().nullable(),
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      score: z.number(),
      kinds: readonlyStringRecord,
      kind_occurrence_count: z.number().optional(),
      evidence_count: z.number().optional(),
      breakdown: EdgeBreakdownSchema.optional(),
      commit_hash: z.string(),
    }),
  ),
});

export const StatusResponseSchema = z.object({
  project_id: z.string().nullable(),
  branch: z.string().nullable(),
  schema_version: z.number(),
  expected_schema_version: z.number(),
  schema_compatible: z.boolean(),
  store_present: z.boolean(),
  writer_active: z.boolean(),
  commit_count: z.number(),
  scope: z
    .object({
      project_label: z.string(),
      module_prefixes: z.array(z.string()),
      include_modules: z.array(z.string()),
      all_modules: z.boolean(),
      repo_path: z.string().nullable(),
    })
    .nullable()
    .optional(),
  last_run: z
    .object({
      run_id: z.string(),
      branch: z.string(),
      mode: z.string(),
      status: z.string(),
      started_at: z.string(),
      finished_at: z.string().nullable(),
      commits_total: z.number(),
      commits_succeeded: z.number(),
      commits_failed: z.number(),
    })
    .nullable(),
  run_failures: z
    .object({
      commit_hash: z.string().nullable(),
      commit_order: z.number().nullable(),
      commit_summary: z.string().nullable(),
      file_path: z.string().nullable(),
      error_text: z.string(),
    })
    .array()
    .optional(),
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
  metric: z.string(),
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

export const CatalogResponseSchema = z.object({
  level: z.string(),
  names: z.array(z.string()),
});

export const StructurePointSchema = z.object({
  commit_order: z.number(),
  commit_hash: z.string(),
  edge_count: z.number(),
  total_score: z.number(),
});

export const StructureTimeseriesResponseSchema = z.object({
  points: z.array(StructurePointSchema),
});

export const EdgePointsResponseSchema = z.object({
  commit_hash: z.string(),
  source: z.string(),
  target: z.string(),
  breakdown: EdgeBreakdownSchema,
  kinds: readonlyStringRecord.optional(),
  points: z.array(
    z.object({
      category: z.string(),
      points: z.number(),
      why_points: z.string().optional(),
    }),
  ),
  why_points: z.record(z.string(), z.string()).optional(),
  evidence: z.array(EvidenceRowSchema),
});

export const EdgePointsBatchResponseSchema = z.object({
  commit_hash: z.string(),
  edges: z.array(EdgePointsResponseSchema),
  missing: z.array(z.object({ source: z.string(), target: z.string() })),
});

export const RelationsDiffChangeSchema = z.object({
  source: z.string(),
  target: z.string(),
  change: z.enum(["added", "removed"]),
  score_a: z.number().nullable(),
  score_b: z.number().nullable(),
});

export const RelationsDiffResponseSchema = z.object({
  commit_a: z.string(),
  commit_b: z.string(),
  changes: z.array(RelationsDiffChangeSchema),
});

export const EdgeKindPointSchema = z.object({
  commit_order: z.number(),
  commit_hash: z.string(),
  kind: z.string(),
  value: z.number(),
});

export const EdgeKindTimeseriesResponseSchema = z.object({
  points: z.array(EdgeKindPointSchema),
});

/** RPC response envelope (webview bridge). */
export const ResponseEnvelopeSchema = z.object({
  kind: z.literal("response"),
  id: z.number(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});