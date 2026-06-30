/**
 * Owns one long-lived read-only `ppi rpc` servant per dashboard panel (FR-023).
 *
 * The bridge is the only place the extension talks to the CLI query process. It
 * correlates JSON-RPC requests/responses by id and tears the process down on
 * dispose. If the servant dies mid-session it is restarted transparently.
 */

import { spawn, type ChildProcess } from "node:child_process";

import { z } from "zod";

import { BridgeErrorRaised, describeBridgeError, type BridgeError, type RpcProcessError, type RpcProtocolError, type RpcRequestError } from "./errors";

/** Schema for a `ppi rpc` line response (newline-delimited JSON). */
const RpcResponseLineSchema = z.object({
  id: z.number().optional(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

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
  readonly reject: (error: BridgeErrorRaised) => void;
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
      throw new BridgeErrorRaised({
        kind: "rpc_process",
        reason: "too_many_restarts",
        message: `ppi rpc exited too many times (${MAX_RESTARTS} in ${RESTART_WINDOW_MS}ms). Check the store or CLI.`,
      });
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
      const reason = (err as NodeJS.ErrnoException).code === "ENOENT" ? "spawn_failed" : "exited";
      const message = (err as NodeJS.ErrnoException).code === "ENOENT"
        ? `ppi rpc failed to start: ${err.message}`
        : `ppi rpc process error: ${err.message}`;
      const error: RpcProcessError = { kind: "rpc_process", reason, message };
      this.markSessionError(error);
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new BridgeErrorRaised(error));
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
      const error: RpcProcessError = {
        kind: "rpc_process",
        reason: "exited",
        message: "ppi rpc servant exited unexpectedly" + (this.stderrTail ? ": " + this.stderrTail.slice(-500) : ""),
      };
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new BridgeErrorRaised(error));
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
    // Validate the line through zod (PPI-034): malformed JSON marks a session error.
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      this.markSessionError({
        kind: "rpc_protocol",
        message: `malformed rpc json line: ${trimmed.slice(0, 200)}`,
      });
      return;
    }
    const parsed = RpcResponseLineSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }
    const data = parsed.data;
    const id = data.id;
    if (id === undefined) {
      return;
    }
    const entry = this.pending.get(id);
    if (!entry) {
      // Unmatched/duplicate response is a protocol violation (FR-022): surface
      // it as a session-level error so the panel can show a controlled signal
      // instead of a silent console warning.
      const error: RpcProtocolError = {
        kind: "rpc_protocol",
        message: `protocol violation: unmatched rpc response id ${id}`,
      };
      this.markSessionError(error);
      return;
    }
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (data.error) {
      entry.reject(new BridgeErrorRaised({ kind: "rpc_protocol", message: `${data.error.code}: ${data.error.message}` }));
    } else {
      entry.resolve(data.result);
    }
  }

  /** Log a non-fatal protocol/lifecycle violation for diagnostics. */
  private markSessionError(error: BridgeError): void {
    console.warn(`[ppi] ${describeBridgeError(error)}`);
  }

  /** Send a request and await the response. Restarts the servant if it died. */
  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new BridgeErrorRaised({ kind: "rpc_request", reason: "disposed", method, message: "query bridge disposed" }));
    }
    if (!this.proc || this.proc.exitCode !== null) {
      try {
        this.start();
      } catch (err) {
        if (err instanceof BridgeErrorRaised) {
          return Promise.reject(err);
        }
        return Promise.reject(new BridgeErrorRaised({ kind: "rpc_process", reason: "spawn_failed", message: (err as Error).message }));
      }
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params }) + "\n";
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const error: RpcRequestError = { kind: "rpc_request", reason: "timeout", method, message: `ppi rpc request timed out: ${method}` };
        reject(new BridgeErrorRaised(error));
      }, REQUEST_TIMEOUT_MS);
      const wrappedResolve = (value: unknown) => {
        clearTimeout(timer);
        resolve(value as T);
      };
      const wrappedReject = (err: BridgeErrorRaised) => {
        clearTimeout(timer);
        reject(err);
      };
      this.pending.set(id, { resolve: wrappedResolve, reject: wrappedReject, timer });
      const stdin = this.proc?.stdin;
      if (!stdin || !stdin.write(payload)) {
        this.pending.delete(id);
        clearTimeout(timer);
        const error: RpcRequestError = { kind: "rpc_request", reason: "stdin_unavailable", method, message: "ppi rpc stdin unavailable" };
        reject(new BridgeErrorRaised(error));
        return;
      }
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const error: RpcRequestError = { kind: "rpc_request", reason: "disposed", method: "", message: "query bridge disposed" };
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new BridgeErrorRaised(error));
    }
    this.pending.clear();
    if (this.proc) {
      // Send a protocol-level close so the servant closes its reader and exits
      // cleanly, then end stdin and kill as a fallback.
      try {
        this.proc.stdin?.write(JSON.stringify({ id: 0, method: "rpc.close", params: {} }) + "\n");
      } catch {
        // ignore
      }
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

