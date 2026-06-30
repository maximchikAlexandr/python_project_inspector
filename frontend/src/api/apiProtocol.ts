/**
 * Pure RPC protocol logic shared by `HttpDataSource` and `WebviewDataSource`
 * (PPI-022). No `fetch`/`window`/`postMessage` here: those live in
 * `dataSource.ts`. The encoders/decoders here are unit-testable on plain data.
 *
 * Incoming unknown JSON is validated through zod (PPI-022/034) rather than
 * hand-rolled `if` chains, so a malformed bridge message is a typed
 * `DecodeError` instead of a silent `undefined`.
 */

import { type HttpTransportError, type RpcTransportError, type WebviewTransportError } from "../domain/errors";
import { ResponseEnvelopeSchema } from "./schemas";

/** Outgoing request envelope posted to the bridge/extension. */
export interface RequestEnvelope {
  readonly kind: "request";
  readonly id: number;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

/** Build the HTTP URL for a method as a query-string against `/api/<method>`. */
export function httpPath(method: string, params: Readonly<Record<string, unknown>>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return `/api/${method}${suffix}`;
}

/** Build a complete HTTP request (`url` + `init`) from method and params (PPI-022). */
export function encodeHttpRequest(method: string, params: Readonly<Record<string, unknown>>, init?: RequestInit): { url: string; init: RequestInit } {
  return { url: httpPath(method, params), init: init ?? { method: "GET" } };
}

/** Build the outgoing request envelope (pure). */
export function encodeRpcEnvelope(id: number, method: string, params: Record<string, unknown>): RequestEnvelope {
  return { kind: "request", id, method, params };
}

export type MatchedResponse =
  | { readonly status: "ok"; readonly id: number; readonly result: unknown }
  | { readonly status: "error"; readonly id: number; readonly error: RpcTransportError };

/** Parse an inbound message into a matched response (with id), or null if not
 * a valid envelope. Used by WebviewDataSource to index pending by id. */
export function parseResponseEnvelope(message: unknown): MatchedResponse | null {
  const parsed = ResponseEnvelopeSchema.safeParse(message);
  if (!parsed.success) {
    return null;
  }
  const env = parsed.data;
  if (env.status === "error") {
    return { status: "error", id: env.id, error: { kind: "rpc", code: env.error.code, message: env.error.message } };
  }
  return { status: "ok", id: env.id, result: env.result };
}

/** Build the HTTP transport error from a `fetch` response (pure). */
export function httpTransportError(url: string, status: number, detail: string): HttpTransportError {
  return { kind: "http", url, status, detail };
}

/** Build the webview transport error (pure). */
export function webviewTransportError(reason: "timeout", message: string): WebviewTransportError {
  return { kind: "webview", reason, message };
}