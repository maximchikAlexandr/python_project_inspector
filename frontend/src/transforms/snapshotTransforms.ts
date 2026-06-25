import { map, pipe, sortBy, sumBy, unique } from "remeda";

import type { CommitRow, EdgeRow, GraphEdge, GraphNode, ModuleSnapshot } from "../api/client";
import { lineCategoryTotal, type LineCategoryKey } from "../registry/odooProfile";

export function graphEdgesToRows(edges: ReadonlyArray<GraphEdge>, commitHash: string): readonly EdgeRow[] {
  return map(edges, (edge) => ({
    source: edge.source,
    target: edge.target,
    score: edge.score,
    kinds: edge.kinds ?? {},
    kind_occurrence_count: edge.kind_occurrence_count,
    evidence_count: edge.evidence_count,
    breakdown: edge.breakdown,
    commit_hash: edge.commit_hash ?? commitHash,
  }));
}

export function visibleLinesTotal(
  modules: ReadonlyArray<ModuleSnapshot>,
  lineCategories: ReadonlySet<LineCategoryKey>,
): number {
  return sumBy(modules, (module) => lineCategoryTotal(module.line_categories, lineCategories));
}

export function moduleOptionsFromModules(modules: ReadonlyArray<ModuleSnapshot>): readonly string[] {
  return pipe(
    modules,
    (items) => map(items, (module) => module.module_name),
    (names) => unique(names),
    sortBy((name) => name),
  );
}

export function commitPositionLabel(commits: ReadonlyArray<CommitRow>, commitHash: string | null): string {
  if (!commitHash) {
    return "—";
  }
  const index = commits.findIndex((row) => row.commit_hash === commitHash);
  if (index < 0) {
    return "—";
  }
  const row = commits[index];
  return `${index + 1} / ${commits.length} · #${row.commit_order} ${row.commit_hash.slice(0, 8)} ${row.summary ?? ""}`;
}

export function resolveProjectStorageKey(
  projectId: string | null | undefined,
  repoPath: string | null | undefined,
  originPathname: string,
): string | null {
  if (projectId) {
    return projectId;
  }
  if (repoPath) {
    return repoPath;
  }
  if (originPathname) {
    return originPathname;
  }
  return null;
}

export function resolveGraphSelection(
  nodes: ReadonlyArray<GraphNode>,
  focusModule: string | null,
): { selectedModule: string | null; clearFocus: boolean; notice: string | null } {
  if (focusModule && nodes.some((node) => node.module_name === focusModule)) {
    return { selectedModule: focusModule, clearFocus: false, notice: null };
  }
  if (focusModule && nodes.length > 0) {
    return {
      selectedModule: null,
      clearFocus: true,
      notice: `Focused module "${focusModule}" is not present at this commit. Focus cleared.`,
    };
  }
  return { selectedModule: null, clearFocus: false, notice: null };
}
