/**
 * Pure RPC protocol logic shared by `HttpDataSource` and `WebviewDataSource`
 * (PPI-022). No `fetch`/`window`/`postMessage` here: those live in
 * `dataSource.ts`. The encoders/decoders here are unit-testable on plain data.
 *
 * Incoming unknown JSON is validated through zod (PPI-022/034) rather than
 * hand-rolled `if` chains, so a malformed bridge message is a typed
 * `DecodeError` instead of a silent `undefined`.
 */

import { DecodeErrorRaised, TransportErrorRaised, type HttpTransportError, type RpcTransportError, type TransportError, type WebviewTransportError, type WebviewTransportReason } from "../domain/errors";
import { ResponseEnvelopeSchema } from "./schemas";

/** Outgoing request envelope posted to the bridge/extension. */
export interface RequestEnvelope {
  readonly kind: "request";
  readonly id: number;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

/** Incoming response envelope from the bridge/extension. */
export interface ResponseEnvelope {
  readonly kind: "response";
  readonly id: number;
  readonly result?: unknown;
  readonly error?: { code: string; message: string };
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

/** Decode an HTTP `Response` into the RPC result (PPI-022). Returns `null`
 * when the response is plain JSON (the common case for /api/* endpoints).
 * Bridges (webview) use {@link matchPendingResponse} instead. */
export function decodeRpcResponse(response: Response): Promise<unknown> {
  return response.json() as Promise<unknown>;
}

/** Build the outgoing request envelope (pure). */
export function encodeRpcEnvelope(id: number, method: string, params: Record<string, unknown>): RequestEnvelope {
  return { kind: "request", id, method, params };
}

/**
 * Match an incoming message against a pending request id. Returns the
 * decoded result/error; unknown ids/no envelope are ignored (return `null`).
 *
 * Validates the message through zod (PPI-022/034): malformed shapes do not
 * throw, they simply do not match.
 */
export type MatchedResponse =
  | { readonly status: "ok"; readonly result: unknown }
  | { readonly status: "error"; readonly error: RpcTransportError };

export function matchPendingResponse(message: unknown, pendingId: number): MatchedResponse | null {
  const parsed = ResponseEnvelopeSchema.safeParse(message);
  if (!parsed.success) {
    return null;
  }
  const env = parsed.data;
  if (env.id !== pendingId) {
    return null;
  }
  if (env.error) {
    return {
      status: "error",
      error: { kind: "rpc", code: env.error.code, message: env.error.message },
    };
  }
  return { status: "ok", result: env.result };
}

/** Build the HTTP transport error from a `fetch` response (pure). */
export function httpTransportError(url: string, status: number, detail: string): HttpTransportError {
  return { kind: "http", url, status, detail };
}

/** Build the webview transport error (pure). */
export function webviewTransportError(reason: WebviewTransportReason, message: string): WebviewTransportError {
  return { kind: "webview", reason, message };
}

/** Re-raise helper: converts a typed `TransportError` into a thrown error. */
export function raiseTransportError(error: HttpTransportError | RpcTransportError | WebviewTransportError): never {
  throw new TransportErrorRaised(error);
}

/** Convert an unknown thrown value into a typed `TransportError` (PPI-022/034). */
export function decodeTransportError(thrown: unknown, fallback: { readonly kind: "rpc"; readonly code: string; readonly message: string }): TransportError {
  if (thrown instanceof TransportErrorRaised) {
    return thrown.error;
  }
  if (thrown instanceof DecodeErrorRaised) {
    return { kind: "rpc", code: "DECODE", message: `decode failure: ${thrown.error.reason}` };
  }
  if (thrown instanceof Error) {
    return { kind: "rpc", code: fallback.code, message: thrown.message };
  }
  return fallback;
}