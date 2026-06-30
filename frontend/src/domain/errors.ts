/**
 * Typed errors that cross module/transport boundaries (PPI-034).
 *
 * Recoverable transport/decode failures are typed values, not plain `Error`:
 * callers can `switch` on `kind` instead of parsing message strings. Truly
 * impossible states throw plain `Error`.
 */

/** Transport failure raised by `HttpDataSource` / `WebviewDataSource`. */
export type TransportError =
  | HttpTransportError
  | RpcTransportError
  | WebviewTransportError;

/** HTTP request failed (non-2xx or network error). */
export interface HttpTransportError {
  readonly kind: "http";
  readonly url: string;
  readonly status: number;
  readonly detail: string;
}

/** `ppi rpc` servant returned an `{error}` envelope. */
export interface RpcTransportError {
  readonly kind: "rpc";
  readonly code: string;
  readonly message: string;
}

/** Webview message bridge lifecycle failure (timeout, disposed, no api). */
export interface WebviewTransportError {
  readonly kind: "webview";
  readonly reason: "timeout";
  readonly message: string;
}

export class TransportErrorRaised extends Error {
  readonly error: TransportError;
  constructor(error: TransportError) {
    super(describeTransportError(error));
    this.name = "TransportErrorRaised";
    this.error = error;
  }
}

export function describeTransportError(error: TransportError): string {
  switch (error.kind) {
    case "http":
      return `${error.url} -> ${error.status}: ${error.detail}`;
    case "rpc":
      return `${error.code}: ${error.message}`;
    case "webview":
      return `webview transport: ${error.reason} (${error.message})`;
  }
}

/** Decode failure for incoming unknown JSON/messages (PPI-034/040). */
export interface DecodeError {
  readonly kind: "decode";
  readonly reason: string;
  readonly received: unknown;
}

export class DecodeErrorRaised extends Error {
  readonly error: DecodeError;
  constructor(error: DecodeError) {
    super(`decode failure: ${error.reason}`);
    this.name = "DecodeErrorRaised";
    this.error = error;
  }
}