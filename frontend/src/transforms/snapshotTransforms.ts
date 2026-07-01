import type { CommitRow, GraphNode } from "../api/client";

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
