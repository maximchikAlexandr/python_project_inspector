/**
 * Spawn and supervise a `ppi analyze --json` run for the editor (FR-001/002/019/020).
 *
 * The runner is the only owner of the analysis subprocess lifecycle. It parses
 * the JSON-lines progress stream, forwards events to a callback, supports
 * cancellation (SIGTERM -> SIGKILL), and recovers a stale writer lock after cancel
 * so the next run is not blocked.
 */

import { spawn } from "node:child_process";

import { CliNotFound, type ProgressEvent, type RunCompleted, type RunFailed } from "./contracts";
import { TERMINAL_EVENT_TYPES } from "./contracts";

export interface AnalyzeOptions {
  readonly cliArgs: string[];
  readonly repo: string;
  readonly profile: string;
  readonly analysisDir?: string;
  readonly rebuild?: boolean;
  readonly onEvent: (event: ProgressEvent) => void;
}

export interface RunHandle {
  /** Collected CLI stderr (for failure diagnostics, FR-004/SC-006). */
  readonly stderrTail: string;
  cancel(): Promise<void>;
  readonly done: Promise<RunCompleted | RunFailed | "cancelled">;
}

/** Build the full argv for `ppi ... analyze --json`. */
export function buildAnalyzeArgv(opts: AnalyzeOptions): string[] {
  const argv = [...opts.cliArgs, "--repo", opts.repo, "--profile", opts.profile];
  if (opts.analysisDir && opts.analysisDir.trim()) {
    argv.push("--analysis-dir", opts.analysisDir.trim());
  }
  argv.push("analyze", "--json");
  if (opts.rebuild) {
    argv.push("--rebuild");
  }
  return argv;
}

/** Run `ppi analyze --json` and return a handle to observe/cancel it. */
export function runAnalyze(opts: AnalyzeOptions): RunHandle {
  const argv = buildAnalyzeArgv(opts);
  const child = spawn(argv[0], argv.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
  let stderrBuffer = "";

  let buffer = "";
  let runId: string | null = null;
  let terminal: RunCompleted | RunFailed | "cancelled" | null = null;
  let cancelled = false;
  let resolveDone: ((value: RunCompleted | RunFailed | "cancelled") => void) | null = null;

  /** Resolve the run with a terminal outcome exactly once. */
  const finish = (value: RunCompleted | RunFailed | "cancelled"): void => {
    if (terminal === null) {
      terminal = value;
      resolveDone?.(value);
    }
  };

  const done = new Promise<RunCompleted | RunFailed | "cancelled">((resolve) => {
    resolveDone = resolve;
    const handleEvent = (event: ProgressEvent): void => {
      if (event.type === "run_started") {
        runId = event.run_id;
      }
      opts.onEvent(event);
      if (TERMINAL_EVENT_TYPES.has(event.type)) {
        finish(event as RunCompleted | RunFailed);
      }
    };

    const handleLine = (line: string): void => {
      const event = parseProgressLine(line);
      if (event) {
        handleEvent(event);
      }
    };

    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stderr?.on("data", (chunk: string) => {
      stderrBuffer += chunk;
      if (stderrBuffer.length > 4000) {
        stderrBuffer = stderrBuffer.slice(-4000);
      }
    });
    child.stdout?.on("data", (chunk: string) => {
      const parsed = parseProgressChunk(buffer, chunk);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        handleEvent(event);
      }
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        opts.onEvent({
          type: "run_failed",
          run_id: runId ?? "",
          exit_reason: "unknown",
          message: new CliNotFound(err.message).message,
        });
      }
      finish({
        type: "run_failed",
        run_id: runId ?? "",
        exit_reason: "unknown",
        message: err.message,
      });
    });

    child.on("close", (code) => {
      // Flush any trailing line without a newline.
      if (buffer.trim()) {
        const trailing = buffer;
        buffer = "";
        handleLine(trailing);
      }
      if (terminal === null && !cancelled) {
        // Process exited without a terminal event and we were not cancelling.
        finish({
          type: "run_failed",
          run_id: runId ?? "",
          exit_reason: "unknown",
          message: `ppi exited with code ${code} and no terminal event${stderrBuffer ? "\n" + stderrBuffer.slice(-1500) : ""}`,
        });
      }
    });
  });

  const cancel = async (): Promise<void> => {
    if (cancelled || terminal !== null) {
      return;
    }
    cancelled = true;
    let exited = false;
    child.once("exit", () => { exited = true; });
    child.kill("SIGTERM");
    await new Promise<void>((resolveKill) => {
      const grace = setTimeout(() => {
        if (!exited && child.exitCode === null) {
          child.kill("SIGKILL");
        }
        resolveKill();
      }, 3_000);
      child.on("exit", () => {
        clearTimeout(grace);
        resolveKill();
      });
    });
    await recoverStaleLock(opts);
    finish("cancelled");
  };

  return {
    get stderrTail() {
      return stderrBuffer;
    },
    cancel,
    done,
  };
}

/** Clear a stale writer lock left by a cancelled run (FR-020). */
async function recoverStaleLock(opts: AnalyzeOptions): Promise<void> {
  const argv = [...opts.cliArgs, "--repo", opts.repo];
  if (opts.analysisDir && opts.analysisDir.trim()) {
    argv.push("--analysis-dir", opts.analysisDir.trim());
  }
  argv.push("doctor", "--recover-stale");
  await new Promise<void>((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: "ignore" });
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}


/** Parse one JSON-line into a progress event, or return null for noise/invalid. */
export function parseProgressLine(line: string): ProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const event = JSON.parse(trimmed) as ProgressEvent;
    if (typeof event !== "object" || event === null || typeof (event as { type?: unknown }).type !== "string") {
      return null;
    }
    return event;
  } catch {
    return null;
  }
}

/** Parse a raw stdout chunk into events plus any trailing partial line. */
export function parseProgressChunk(
  buffer: string,
  chunk: string,
): { readonly events: ProgressEvent[]; readonly rest: string } {
  const data = buffer + chunk;
  const lines = data.split("\n");
  const rest = lines.pop() ?? "";
  const events: ProgressEvent[] = [];
  for (const line of lines) {
    const event = parseProgressLine(line);
    if (event) {
      events.push(event);
    }
  }
  return { events, rest };
}
