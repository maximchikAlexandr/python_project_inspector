import { map } from "remeda";

import type { CommitRow } from "../api/client";

export type CommitOption = {
  readonly value: string;
  readonly label: string;
  readonly authoredAt: string | null;
  readonly commitOrder: number;
};

export function toCommitSelectOptions(commits: ReadonlyArray<CommitRow>): CommitOption[] {
  return map(commits, (row) => ({
    value: row.commit_hash,
    label: `#${row.commit_order} ${row.commit_hash.slice(0, 8)} ${row.summary ?? ""}`,
    authoredAt: row.authored_at,
    commitOrder: row.commit_order,
  }));
}

export function toCommitSelectOptionsShort(commits: ReadonlyArray<CommitRow>): { value: string; label: string }[] {
  return map(commits, (row) => ({
    value: row.commit_hash,
    label: `#${row.commit_order} ${row.commit_hash.slice(0, 8)}`,
  }));
}
