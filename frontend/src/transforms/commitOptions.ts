import { map } from "remeda";

import type { CommitRow } from "../api/client";

export function toCommitSelectOptions(commits: CommitRow[]): { value: string; label: string }[] {
  return map(commits, (row) => ({
    value: row.commit_hash,
    label: `#${row.commit_order} ${row.commit_hash.slice(0, 8)} ${row.summary ?? ""}`,
  }));
}

export function toCommitSelectOptionsShort(commits: CommitRow[]): { value: string; label: string }[] {
  return map(commits, (row) => ({
    value: row.commit_hash,
    label: `#${row.commit_order} ${row.commit_hash.slice(0, 8)}`,
  }));
}
