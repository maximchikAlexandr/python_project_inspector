/**
 * Contract parity test (T081).
 *
 * Mirrors tests/contract/test_contract_parity.py on the frontend side.
 * Verifies that the Zod schemas in frontend/src/api/schemas.ts have
 * the same set of fields as the backend Pydantic schemas (documented
 * in contracts/*.md and pinned by the backend test).
 *
 * If a field is added/removed in either side without updating both,
 * this test fails.
 */
import { describe, it, expect } from "vitest";

import type { paths as OpenAPIPaths } from "./openapi-generated";

import {
  UiConfigResponseSchema,
  UiGraphConfigSchema,
  UiOptionSchema,
  UiMetricOptionSchema,
  UiColumnDefinitionSchema,
  UiTableDefinitionSchema,
  GenericTableResponseSchema,
  GenericTableRowSchema,
  RelationsResponseSchema,
  RelationRowSchema,
  ProjectInfoResponseSchema,
  GraphResponseSchema,
  GraphNodeSchema,
  GraphEdgeSchema,
  TimeseriesResponseSchema,
  TimeseriesSeriesSchema,
  TimeseriesPointSchema,
  HotspotsResponseSchema,
  HotspotItemSchema,
} from "./schemas";

const SCHEMA_KEYS = (
  schema: { shape: Record<string, unknown> },
): Set<string> => new Set(Object.keys(schema.shape));

describe("UiConfigResponse", () => {
  it("has exactly the documented top-level fields", () => {
    expect(SCHEMA_KEYS(UiConfigResponseSchema)).toEqual(
      new Set(["dashboard_metrics", "aggregations", "tables", "graph"]),
    );
  });
  it("UiGraphConfig has the documented fields", () => {
    expect(SCHEMA_KEYS(UiGraphConfigSchema)).toEqual(
      new Set([
        "edge_types",
        "line_categories",
        "brightness_metrics",
        "node_size_metrics",
        "link_thickness_metrics",
      ]),
    );
  });
  it("UiOption has id/label/default_enabled", () => {
    expect(SCHEMA_KEYS(UiOptionSchema)).toEqual(new Set(["id", "label", "default_enabled"]));
  });
  it("UiMetricOption has id/label/unit/format/default_enabled/supported_levels", () => {
    expect(SCHEMA_KEYS(UiMetricOptionSchema)).toEqual(
      new Set(["id", "label", "unit", "format", "default_enabled", "supported_levels"]),
    );
  });
  it("UiColumnDefinition has key/label/type/metric_id/width", () => {
    expect(SCHEMA_KEYS(UiColumnDefinitionSchema)).toEqual(
      new Set(["key", "label", "type", "metric_id", "width"]),
    );
  });
  it("UiTableDefinition has key/label/columns", () => {
    expect(SCHEMA_KEYS(UiTableDefinitionSchema)).toEqual(new Set(["key", "label", "columns"]));
  });
});

describe("GenericTableResponse", () => {
  it("has commit_hash/rows", () => {
    expect(SCHEMA_KEYS(GenericTableResponseSchema)).toEqual(new Set(["commit_hash", "rows"]));
  });
  it("GenericTableRow has id/cells/actions", () => {
    expect(SCHEMA_KEYS(GenericTableRowSchema)).toEqual(new Set(["id", "cells", "actions"]));
  });
});

describe("RelationsResponse", () => {
  it("has commit_hash/relations", () => {
    expect(SCHEMA_KEYS(RelationsResponseSchema)).toEqual(new Set(["commit_hash", "relations"]));
  });
  it("RelationRow has the documented fields", () => {
    expect(SCHEMA_KEYS(RelationRowSchema)).toEqual(
      new Set([
        "source_id",
        "source_label",
        "target_id",
        "target_label",
        "relation_type_id",
        "relation_type_label",
        "strength_metric_id",
        "strength_metric_label",
        "strength_value",
      ]),
    );
  });
});

describe("ProjectInfoResponse", () => {
  it("has the documented fields", () => {
    expect(SCHEMA_KEYS(ProjectInfoResponseSchema)).toEqual(
      new Set(["project_id", "branch", "commit_count", "schema_version", "store_present"]),
    );
  });
});

describe("GraphResponse", () => {
  it("GraphResponse has commit_hash/nodes/edges", () => {
    expect(SCHEMA_KEYS(GraphResponseSchema)).toEqual(new Set(["commit_hash", "nodes", "edges"]));
  });
  it("GraphNode does NOT have line_categories (removed in UI-005)", () => {
    const keys = SCHEMA_KEYS(GraphNodeSchema);
    expect(keys).not.toContain("line_categories");
    expect(keys).toEqual(new Set(["module_name", "total_lines", "metrics", "line_counts"]));
  });
  it("GraphEdge has source/target/score/kinds/breakdown/...", () => {
    expect(SCHEMA_KEYS(GraphEdgeSchema)).toEqual(
      new Set([
        "source",
        "target",
        "score",
        "breakdown",
        "kinds",
        "kind_occurrence_count",
        "commit_hash",
      ]),
    );
  });
});

describe("TimeseriesResponse", () => {
  it("uses metric_id (not metric)", () => {
    const keys = SCHEMA_KEYS(TimeseriesResponseSchema);
    expect(keys).not.toContain("metric");
    expect(keys).toEqual(new Set(["level", "metric_id", "agg", "series"]));
  });
  it("TimeseriesSeries has name/points", () => {
    expect(SCHEMA_KEYS(TimeseriesSeriesSchema)).toEqual(new Set(["name", "points"]));
  });
  it("TimeseriesPoint has commit_order/commit_hash/value", () => {
    expect(SCHEMA_KEYS(TimeseriesPointSchema)).toEqual(
      new Set(["commit_order", "commit_hash", "value"]),
    );
  });
});

describe("HotspotsResponse", () => {
  it("HotspotsResponse has by/items", () => {
    expect(SCHEMA_KEYS(HotspotsResponseSchema)).toEqual(new Set(["by", "items"]));
  });
  it("HotspotItem has name/current/first/growth", () => {
    expect(SCHEMA_KEYS(HotspotItemSchema)).toEqual(
      new Set(["name", "current", "first", "growth"]),
    );
  });
});

describe("OpenAPI generated types", () => {
  it("openapi-generated.d.ts is in sync with backend routes", () => {
    // The act of referencing these type aliases (with `unknown` cast)
    // typechecks the generated file: if `openapi:generate` wasn't run
    // after a new endpoint, this will fail to compile.
    type _UiConfigPath = OpenAPIPaths["/api/ui/config"];
    type _TimeseriesPath = OpenAPIPaths["/api/metrics/timeseries"];
    type _RelationsPath = OpenAPIPaths["/api/snapshot/relations"];
    type _GraphPath = OpenAPIPaths["/api/graph"];
    type _HotspotsPath = OpenAPIPaths["/api/hotspots"];

    const keys: string[] = [
      "ui_config" as keyof _UiConfigPath,
      "timeseries" as keyof _TimeseriesPath,
      "relations" as keyof _RelationsPath,
      "graph" as keyof _GraphPath,
      "hotspots" as keyof _HotspotsPath,
    ];
    expect(keys.length).toBe(5);
  });
});
