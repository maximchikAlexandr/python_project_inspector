/**
 * Unit tests for typed transport errors and pure RPC protocol (PPI-022/034/042).
 */
import { describe, it, expect } from "vitest";

import { DecodeErrorRaised, describeTransportError, TransportErrorRaised } from "./errors";
import { encodeRpcEnvelope, httpPath, httpTransportError, parseResponseEnvelope, type RequestEnvelope } from "../api/apiProtocol";

describe("describeTransportError", () => {
  it("formats http errors with url, status and detail", () => {
    expect(describeTransportError({ kind: "http", url: "/api/x", status: 500, detail: "boom" })).toBe(
      "/api/x -> 500: boom",
    );
  });

  it("formats rpc errors with code and message", () => {
    expect(describeTransportError({ kind: "rpc", code: "INTERNAL", message: "nope" })).toBe("INTERNAL: nope");
  });

  it("formats webview errors with reason and message", () => {
    expect(describeTransportError({ kind: "webview", reason: "timeout", message: "slow" })).toBe(
      "webview transport: timeout (slow)",
    );
  });
});

describe("TransportErrorRaised", () => {
  it("carries the typed error", () => {
    const error = { kind: "rpc", code: "X", message: "y" } as const;
    const raised = new TransportErrorRaised(error);
    expect(raised.error).toBe(error);
    expect(raised.name).toBe("TransportErrorRaised");
  });
});

describe("DecodeErrorRaised", () => {
  it("carries the decode error", () => {
    const error = { kind: "decode", reason: "shape", received: 42 } as const;
    const raised = new DecodeErrorRaised(error);
    expect(raised.error).toBe(error);
    expect(raised.name).toBe("DecodeErrorRaised");
  });
});

describe("httpPath", () => {
  it("omits undefined/null/empty params", () => {
    expect(httpPath("status", { a: undefined, b: null, c: "", d: 1 })).toBe("/api/status?d=1");
  });
});

describe("encodeRpcEnvelope", () => {
  it("builds a request envelope with kind/id/method/params", () => {
    const env: RequestEnvelope = encodeRpcEnvelope(7, "graph", { x: 1 });
    expect(env).toEqual({ kind: "request", id: 7, method: "graph", params: { x: 1 } });
  });
});

describe("parseResponseEnvelope", () => {
  it("returns null for non-envelope", () => {
    expect(parseResponseEnvelope(null)).toBeNull();
    expect(parseResponseEnvelope({ kind: "other", id: 1 })).toBeNull();
  });

  it("returns null for a malformed envelope (zod rejects, PPI-022/034)", () => {
    expect(parseResponseEnvelope({ kind: "response" })).toBeNull();
    expect(parseResponseEnvelope({ kind: "response", id: "x", result: 1 })).toBeNull();
    expect(parseResponseEnvelope({ kind: "response", status: "ok", id: 1 })).toBeNull();
    expect(parseResponseEnvelope({ kind: "response", status: "maybe", id: 1, result: 1 })).toBeNull();
    expect(parseResponseEnvelope("not-an-object")).toBeNull();
  });

  it("decodes an ok response", () => {
    const matched = parseResponseEnvelope({ kind: "response", status: "ok", id: 1, result: { ok: true } });
    expect(matched?.status).toBe("ok");
    if (matched && matched.status === "ok") {
      expect(matched.result).toEqual({ ok: true });
    }
  });

  it("decodes an error response into an rpc transport error", () => {
    const matched = parseResponseEnvelope(
      { kind: "response", status: "error", id: 1, error: { code: "X", message: "fail" } },
    );
    expect(matched?.status).toBe("error");
    if (matched && matched.status === "error") {
      expect(matched.error).toEqual({ kind: "rpc", code: "X", message: "fail" });
    }
  });
});

describe("httpTransportError", () => {
  it("builds an http transport error", () => {
    expect(httpTransportError("/api/x", 503, "down")).toEqual({
      kind: "http",
      url: "/api/x",
      status: 503,
      detail: "down",
    });
  });
});