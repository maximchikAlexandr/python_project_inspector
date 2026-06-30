/**
 * Typed errors for the VS Code extension bridge (PPI-034).
 *
 * Recoverable transport/lifecycle failures are typed values so callers can
 * `switch` on `kind`.
 */

/** Transport/lifecycle failure from the `ppi rpc` bridge. */
export type BridgeError =
  | RpcProcessError
  | RpcRequestError
  | RpcProtocolError;

/** `ppi rpc` servant process failed to start or exited unexpectedly. */
export interface RpcProcessError {
  readonly kind: "rpc_process";
  readonly reason: "spawn_failed" | "exited" | "too_many_restarts";
  readonly message: string;
}

/** A pending `ppi rpc` request failed (timeout, stdin unavailable, disposed). */
export interface RpcRequestError {
  readonly kind: "rpc_request";
  readonly reason: "timeout" | "stdin_unavailable" | "disposed";
  readonly method: string;
  readonly message: string;
}

/** `ppi rpc` returned an unmatched/malformed response (protocol violation). */
export interface RpcProtocolError {
  readonly kind: "rpc_protocol";
  readonly message: string;
}

export class BridgeErrorRaised extends Error {
  readonly error: BridgeError;
  constructor(error: BridgeError) {
    super(describeBridgeError(error));
    this.name = "BridgeErrorRaised";
    this.error = error;
  }
}

export function describeBridgeError(error: BridgeError): string {
  switch (error.kind) {
    case "rpc_process":
      return `rpc process ${error.reason}: ${error.message}`;
    case "rpc_request":
      return `rpc request ${error.reason} (${error.method}): ${error.message}`;
    case "rpc_protocol":
      return `rpc protocol: ${error.message}`;
  }
}