import type { CommitRow } from "../api/client";

export type TimelapseActionKind = "play" | "pause" | "prev" | "next" | "speed";

export type TimelapseInput = {
  readonly action: { kind: TimelapseActionKind; speed?: number };
  readonly commits: readonly CommitRow[];
  readonly selectedCommit: string | null;
  readonly playing: boolean;
  readonly speed: number;
};

export type TimelapseOutput = {
  readonly playing: boolean;
  readonly speed: number;
  readonly selectedCommit: string | null;
};

export function nextTimelapseState({
  action,
  commits,
  selectedCommit,
  playing,
  speed,
}: TimelapseInput): TimelapseOutput {
  if (commits.length < 2) {
    return { playing: false, speed, selectedCommit };
  }
  if (action.kind === "pause") {
    return { playing: false, speed, selectedCommit };
  }
  if (action.kind === "speed") {
    return { playing, speed: action.speed ?? speed, selectedCommit };
  }
  const index = commits.findIndex((row) => row.commit_hash === selectedCommit);
  if (action.kind === "prev") {
    if (index > 0) {
      return { playing, speed, selectedCommit: commits[index - 1].commit_hash };
    }
    return { playing, speed, selectedCommit };
  }
  if (action.kind === "next") {
    if (index < 0) {
      return { playing: false, speed, selectedCommit };
    }
    if (index >= commits.length - 1) {
      return { playing: false, speed, selectedCommit };
    }
    return { playing, speed, selectedCommit: commits[index + 1].commit_hash };
  }
  if (action.kind === "play") {
    if (index < 0 || index >= commits.length - 1) {
      return { playing: true, speed, selectedCommit: commits[0].commit_hash };
    }
    return { playing: true, speed, selectedCommit };
  }
  return { playing, speed, selectedCommit };
}
