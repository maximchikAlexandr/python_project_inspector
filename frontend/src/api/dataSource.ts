/**
 * Pluggable data source for the dashboard.
 *
 * The browser uses `HttpDataSource` (fetch against `/api/...`); the VS Code
 * Webview uses `WebviewDataSource` (postMessage bridge to the extension, which
 * forwards to `ppi rpc`). Both expose the same method names so the rest of the
 * app is transport-agnostic (Spec FR-018/SC-003).
 */


export interface DataSource {
  get<T>(method: string, params?: Record<string, unknown>): Promise<T>;
  post<T>(method: string, body: unknown): Promise<T>;
}

/** Build the HTTP URL for a method as a query-string against `/api/<method>`. */
export function httpPath(method: string, params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return `/api/${method}${suffix}`;
}

async function httpFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${url} -> ${response.status}: ${detail}`);
  }
  return response.json() as Promise<T>;
}

export class HttpDataSource implements DataSource {
  get<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return httpFetch<T>(httpPath(method, params));
  }
  post<T>(method: string, body: unknown): Promise<T> {
    return httpFetch<T>(`/api/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

interface RequestEnvelope {
  readonly kind: "request";
  readonly id: number;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

interface ResponseEnvelope {
  readonly kind: "response";
  readonly id: number;
  readonly result?: unknown;
  readonly error?: { code: string; message: string };
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

export class WebviewDataSource implements DataSource {
  // VS Code permits acquireVsCodeApi() exactly once per webview instance; this
  // class must therefore be constructed exactly once, top-level, before any
  // re-mount (webview-main.tsx does this at bootstrap).
  private readonly api: VsCodeApi;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readonly handler: (event: MessageEvent) => void;

  constructor() {
    this.api = acquireVsCodeApi();
    this.handler = (event: MessageEvent) => {
      const message = event.data as ResponseEnvelope;
      if (!message || message.kind !== "response") {
        return;
      }
      const entry = this.pending.get(message.id);
      if (!entry) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(`${message.error.code}: ${message.error.message}`));
      } else {
        entry.resolve(message.result);
      }
    };
    window.addEventListener("message", this.handler);
  }

  private request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const envelope: RequestEnvelope = { kind: "request", id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.api.postMessage(envelope);
    });
  }

  get<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.request<T>(method, params);
  }

  /** POST sends the body directly as the request params (no wrapper envelope). */
  post<T>(method: string, body: unknown): Promise<T> {
    return this.request<T>(method, body as Record<string, unknown>);
  }

}

let active: DataSource = new HttpDataSource();

export function setDataSource(source: DataSource): void {
  active = source;
}

export function getDataSource(): DataSource {
  return active;
}
