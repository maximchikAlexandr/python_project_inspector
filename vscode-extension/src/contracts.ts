/**
 * Shared event/error contracts for the PPI VS Code bridge.
 *
 * Mirrors the Python msgspec contracts in ``src/ppi/runtime/progress.py`` and
 * ``src/ppi/query/contracts.py``. Only types that have real consumers are
 * exported; transport-shaped message types are kept inline at their use sites
 * (the webview panel / query bridge) instead of speculative duplicates here.
 */

/** Discriminated union of `ppi analyze --json` progress events (FR-019). */
export type ProgressEvent = RunStarted | CommitProgress | RunCompleted | RunFailed;

export interface RunStarted {
  readonly type: "run_started";
  readonly run_id: string;
  readonly branch: string;
  readonly mode: "incremental" | "rebuild";
  readonly commits_total: number;
}

export interface CommitProgress {
  readonly type: "commit_progress";
  readonly processed: number;
  readonly commits_total: number;
  readonly short_hash: string;
  readonly phase: string;
}

export interface RunCompleted {
  readonly type: "run_completed";
  readonly run_id: string;
  readonly commits_succeeded: number;
  readonly commits_failed: number;
  readonly duration_ms: number;
}

export interface RunFailed {
  readonly type: "run_failed";
  readonly run_id: string;
  readonly exit_reason: "cli_error" | "schema_incompatible" | "lock_busy" | "bad_workspace" | "unknown";
  readonly message: string;
  readonly stderr_tail?: string;
}

/** Event types that terminate a run (used to resolve the `done` promise). */
export const TERMINAL_EVENT_TYPES = new Set(["run_completed", "run_failed"]);

/** JSON-RPC error body returned by the `ppi rpc` servant. */
export interface RpcErrorBody {
  readonly code: string;
  readonly message: string;
}

/** Raised when the resolved `ppi` CLI executable cannot be launched (FR-014). */
export class CliNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliNotFound";
  }
}
