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
  decodeRpcResponse,
  encodeHttpRequest,
  encodeRpcEnvelope,
  httpTransportError,
  matchPendingResponse,
  raiseTransportError,
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
    raiseTransportError(httpTransportError(url, response.status, detail));
  }
  return decodeRpcResponse(response) as Promise<T>;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
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
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: TransportErrorRaised) => void }>();
  private readonly handler: (event: MessageEvent) => void;

  constructor() {
    this.api = acquireVsCodeApi();
    this.handler = (event: MessageEvent) => {
      const message = event.data;
      for (const [id, entry] of this.pending) {
        const matched = matchPendingResponse(message, id);
        if (!matched) {
          continue;
        }
        this.pending.delete(id);
        if (matched.status === "error") {
          entry.reject(new TransportErrorRaised(matched.error));
        } else {
          entry.resolve(matched.result);
        }
        return;
      }
    };
    window.addEventListener("message", this.handler);
  }

  private request<T>(method: string, params: Readonly<Record<string, unknown>>): Promise<T> {
    const id = this.nextId++;
    const envelope: RequestEnvelope = encodeRpcEnvelope(id, method, { ...params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
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