import { filter, map, pipe, sortBy, unique } from "remeda";

import type { EdgeRow, StructurePoint } from "../api/client";
import { edgeKindLabel } from "../registry/odooProfile";

export function structureChartRows(points: ReadonlyArray<StructurePoint>): readonly {
  order: number;
  edge_count: number;
  total_score: number;
}[] {
  return map(points, (point) => ({
    order: point.commit_order,
    edge_count: point.edge_count,
    total_score: point.total_score,
  }));
}

export function moduleSelectOptions(edges: ReadonlyArray<EdgeRow>): readonly { value: string; label: string }[] {
  return pipe(
    edges,
    (items) => items.flatMap((edge) => [edge.source, edge.target]),
    (names) => unique(names),
    sortBy((name) => name),
    (names) => map(names, (name) => ({ value: name, label: name })),
  );
}

export function edgeKindSelectOptions(edges: ReadonlyArray<EdgeRow>): readonly { value: string; label: string }[] {
  const kinds = new Set<string>();
  edges.forEach((edge) => {
    Object.entries(edge.kinds ?? {}).forEach(([kind, count]) => {
      if (count > 0) {
        kinds.add(kind);
      }
    });
  });
  return pipe(
    [...kinds],
    sortBy((kind) => kind),
    (items) => map(items, (kind) => ({ value: kind, label: edgeKindLabel(kind) })),
  );
}

export function filterStructureEdges(
  edges: ReadonlyArray<EdgeRow>,
  filters: {
    readonly sourceFilter: string | null;
    readonly targetFilter: string | null;
    readonly kindFilter: string | null;
    readonly minScore: number;
  },
): readonly EdgeRow[] {
  return filter(edges, (edge) => {
    if (filters.sourceFilter && edge.source !== filters.sourceFilter) {
      return false;
    }
    if (filters.targetFilter && edge.target !== filters.targetFilter) {
      return false;
    }
    if ((edge.score ?? 0) < filters.minScore) {
      return false;
    }
    if (filters.kindFilter) {
      return (edge.kinds?.[filters.kindFilter] ?? 0) > 0;
    }
    return true;
  });
}

export function formatEdgeKindsCell(edge: EdgeRow): string {
  const entries = sortBy(
    Object.entries(edge.kinds ?? {}),
    ([, count]) => -count,
  );
  return map(entries, ([kind, count]) => `${edgeKindLabel(kind)} (${count})`).join(", ") || "—";
}

export function pickDefaultStructureCommit(
  points: ReadonlyArray<StructurePoint>,
  commits: ReadonlyArray<{ commit_hash: string }>,
  current: string | null,
): string | null {
  if (current && points.some((point) => point.commit_hash === current)) {
    return current;
  }
  return (
    [...points].reverse().find((point) => point.edge_count > 0)?.commit_hash
    ?? commits[commits.length - 1]?.commit_hash
    ?? null
  );
}
