/**
 * Pluggable data source for the dashboard.
 *
 * The browser uses `HttpDataSource` (fetch against `/api/...`); the VS Code
 * Webview uses `WebviewDataSource` (postMessage bridge to the extension, which
 * forwards to `ppi rpc`). Both expose the same method names so the rest of the
 * app is transport-agnostic (Spec FR-018/SC-003).
 */

import { TransportErrorRaised } from "../domain/errors";
import {
  encodeHttpRequest,
  encodeRpcEnvelope,
  httpTransportError,
  parseResponseEnvelope,
  webviewTransportError,
  type RequestEnvelope,
} from "./apiProtocol";

export interface DataSource {
  get<T>(method: string, params?: Readonly<Record<string, unknown>>): Promise<T>;
  post<T>(method: string, body: unknown): Promise<T>;
}

export { httpPath } from "./apiProtocol";

class HttpDataSource implements DataSource {
  get<T>(method: string, params: Readonly<Record<string, unknown>> = {}): Promise<T> {
    const { url, init } = encodeHttpRequest(method, params);
    return httpFetch<T>(url, init);
  }
  post<T>(method: string, body: unknown): Promise<T> {
    const { url, init } = encodeHttpRequest(method, {}, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return httpFetch<T>(url, init);
  }
}

async function httpFetch<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new TransportErrorRaised(httpTransportError(url, response.status, detail));
  }
  return response.json() as Promise<T>;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

class WebviewDataSource implements DataSource {
  // VS Code permits acquireVsCodeApi() exactly once per webview instance; this
  // class must therefore be constructed exactly once, top-level, before any
  // re-mount (webview-main.tsx does this at bootstrap).
  private readonly api: VsCodeApi;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: TransportErrorRaised) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly handler: (event: MessageEvent) => void;

  constructor() {
    this.api = acquireVsCodeApi();
    this.handler = (event: MessageEvent) => {
      // Index by id (B5): parse the envelope once, look up the pending entry
      // directly — no O(n) scan, no mutation during iteration.
      const matched = parseResponseEnvelope(event.data);
      if (!matched) {
        return;
      }
      const entry = this.pending.get(matched.id);
      if (!entry) {
        return;
      }
      this.pending.delete(matched.id);
      clearTimeout(entry.timer);
      if (matched.status === "error") {
        entry.reject(new TransportErrorRaised(matched.error));
      } else {
        entry.resolve(matched.result);
      }
    };
    window.addEventListener("message", this.handler);
  }

  private request<T>(method: string, params: Readonly<Record<string, unknown>>): Promise<T> {
    const id = this.nextId++;
    const envelope: RequestEnvelope = encodeRpcEnvelope(id, method, { ...params });
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new TransportErrorRaised(webviewTransportError("timeout", `vscode-bridge request timed out: ${method}`)));
        }
      }, 30_000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.api.postMessage(envelope);
    });
  }

  get<T>(method: string, params: Readonly<Record<string, unknown>> = {}): Promise<T> {
    return this.request<T>(method, params);
  }

  /** POST sends the body directly as the request params (no wrapper envelope). */
  post<T>(method: string, body: unknown): Promise<T> {
    return this.request<T>(method, body as Record<string, unknown>);
  }
}

export { HttpDataSource, WebviewDataSource };

let active: DataSource = new HttpDataSource();

export function setDataSource(source: DataSource): void {
  active = source;
}

export function getDataSource(): DataSource {
  return active;
}