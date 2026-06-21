import { filter, map } from "remeda";

import type { EdgePointsResponse, EvidenceRow } from "../api/client";
import { isScoringEdgeKind } from "../registry/odooProfile";

export type KindRow = {
  source: string;
  target: string;
  kind: string;
  points: number;
  total: number;
  evidence: EvidenceRow[];
};

export function buildKindRows(payload: EdgePointsResponse): KindRow[] {
  return map(
    filter(Object.entries(payload.kinds ?? {}), ([kind, points]) => isScoringEdgeKind(kind) && points > 0),
    ([kind, points]) => ({
      source: payload.source,
      target: payload.target,
      kind,
      points,
      total: payload.breakdown.total,
      evidence: (payload.evidence ?? []).filter((item) => item.kind === kind),
    }),
  ).sort((left, right) => right.points - left.points || left.kind.localeCompare(right.kind));
}
