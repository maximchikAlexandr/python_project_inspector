/**
 * Owns one long-lived read-only `ppi rpc` servant per dashboard panel (FR-023).
 *
 * The bridge is the only place the extension talks to the CLI query process. It
 * correlates JSON-RPC requests/responses by id and tears the process down on
 * dispose. If the servant dies mid-session it is restarted transparently.
 */

import { spawn, type ChildProcess } from "node:child_process";

import type { RpcErrorBody } from "./contracts";

export interface QueryBridgeOptions {
  readonly cliArgs: string[];
  readonly repo: string;
  readonly analysisDir?: string;
}

// Restart and timeout tuning. Module constants: no external consumer ever
// overrides these, so exposing them as options was speculative flexibility.
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 30_000;

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export class QueryBridge {
  private readonly options: QueryBridgeOptions;
  private proc: ChildProcess | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private disposed = false;
  private stderrTail = "";
  private restartCount = 0;
  private restartWindowStart = 0;
  private sessionError: string | null = null;

  constructor(options: QueryBridgeOptions) {
    this.options = options;
  }

  /** Start the servant. Must be called before `request`. */
  start(): void {
    if (this.disposed || this.proc) {
      return;
    }
    const now = Date.now();
    if (now - this.restartWindowStart > RESTART_WINDOW_MS) {
      this.restartCount = 0;
      this.restartWindowStart = now;
    }
    this.restartCount++;
    if (this.restartCount > MAX_RESTARTS) {
      throw new Error(`ppi rpc exited too many times (${MAX_RESTARTS} in ${RESTART_WINDOW_MS}ms). Check the store or CLI.`);
    }
    const argv = [...this.options.cliArgs, "--repo", this.options.repo];
    if (this.options.analysisDir?.trim()) {
      argv.push("--analysis-dir", this.options.analysisDir.trim());
    }
    argv.push("rpc");
    this.proc = spawn(argv[0], argv.slice(1), { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout?.setEncoding("utf-8");
    this.proc.stdout?.on("data", (chunk: string) => this.onStdout(chunk));
    this.proc.stderr?.setEncoding("utf-8");
    this.proc.stderr?.on("data", (chunk: string) => {
      this.stderrTail += chunk;
      if (this.stderrTail.length > 4000) {
        this.stderrTail = this.stderrTail.slice(-4000);
      }
    });
    this.proc.on("error", (err) => {
      this.proc = null;
      const message = (err as NodeJS.ErrnoException).code === "ENOENT"
        ? `ppi rpc failed to start: ${err.message}`
        : `ppi rpc process error: ${err.message}`;
      this.markSessionError(message);
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error(message));
      }
      this.pending.clear();
    });
    this.proc.on("exit", () => {
      this.proc = null;
      if (this.disposed) {
        return;
      }
      // Servant died mid-session: surface the failure to in-flight requests
      // (FR-022) and let the next request lazily restart the servant (FR-023).
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error("ppi rpc servant exited unexpectedly" + (this.stderrTail ? ": " + this.stderrTail.slice(-500) : "")));
      }
      this.pending.clear();
    });
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    let parsed: { id?: number; result?: unknown; error?: RpcErrorBody };
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }
    const id = parsed.id;
    if (id === undefined) {
      return;
    }
    const entry = this.pending.get(id);
    if (!entry) {
      // Unmatched/duplicate response is a protocol violation (FR-022): surface
      // it as a session-level error so the panel can show a controlled signal
      // instead of a silent console warning.
      this.markSessionError(`protocol violation: unmatched rpc response id ${id}`);
      return;
    }
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (parsed.error) {
      entry.reject(new Error(`${parsed.error.code}: ${parsed.error.message}`));
    } else {
      entry.resolve(parsed.result);
    }
  }

  /** Mark a non-fatal protocol/lifecycle violation as a session-level error. */
  private markSessionError(message: string): void {
    this.sessionError = message;
    console.warn(`[ppi] ${message}`);
  }

  /** Last recorded session-level error (protocol violation, spawn failure). */
  get sessionErrorMessage(): string | null {
    return this.sessionError;
  }

  /** Send a request and await the response. Restarts the servant if it died. */
  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error("query bridge disposed"));
    }
    if (!this.proc || this.proc.exitCode !== null) {
      try {
        this.start();
      } catch (err) {
        return Promise.reject(err);
      }
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params }) + "\n";
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ppi rpc request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      const wrappedResolve = (value: unknown) => {
        clearTimeout(timer);
        resolve(value as T);
      };
      const wrappedReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };
      this.pending.set(id, { resolve: wrappedResolve, reject: wrappedReject, timer });
      const stdin = this.proc?.stdin;
      if (!stdin || !stdin.write(payload)) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new Error("ppi rpc stdin unavailable"));
        return;
      }
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("query bridge disposed"));
    }
    this.pending.clear();
    if (this.proc) {
      try {
        this.proc.stdin?.end();
      } catch {
        // ignore
      }
      this.proc.kill();
      this.proc = null;
    }
  }
}

