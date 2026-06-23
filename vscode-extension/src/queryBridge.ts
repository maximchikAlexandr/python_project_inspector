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
}

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

export class QueryBridge {
  private readonly options: QueryBridgeOptions;
  private proc: ChildProcess | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private disposed = false;

  constructor(options: QueryBridgeOptions) {
    this.options = options;
  }

  /** Start the servant. Must be called before `request`. */
  start(): void {
    if (this.disposed || this.proc) {
      return;
    }
    // --analysis-dir is intentionally not passed: the read store is derived from --repo
    // (store_path(repo)), so the flag is inert for the servant (E5).
    const argv = [...this.options.cliArgs, "--repo", this.options.repo, "rpc"];
    this.proc = spawn(argv[0], argv.slice(1), { stdio: ["pipe", "pipe", "ignore"] });
    this.proc.stdout?.setEncoding("utf-8");
    this.proc.stdout?.on("data", (chunk: string) => this.onStdout(chunk));
    this.proc.on("exit", () => {
      this.proc = null;
      if (this.disposed) {
        return;
      }
      // Servant died mid-session: surface the failure to in-flight requests
      // (FR-022) and let the next request lazily restart the servant (FR-023).
      for (const [id, entry] of this.pending) {
        this.pending.delete(id);
        entry.reject(new Error("ppi rpc servant exited unexpectedly"));
      }
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
      return;
    }
    this.pending.delete(id);
    if (parsed.error) {
      entry.reject(new Error(`${parsed.error.code}: ${parsed.error.message}`));
    } else {
      entry.resolve(parsed.result);
    }
  }

  /** Send a request and await the response. Restarts the servant if it died. */
  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error("query bridge disposed"));
    }
    if (!this.proc || this.proc.exitCode !== null) {
      this.start();
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params }) + "\n";
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const stdin = this.proc?.stdin;
      if (!stdin || !stdin.write(payload)) {
        this.pending.delete(id);
        reject(new Error("ppi rpc stdin unavailable"));
        return;
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.pending.values()) {
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

