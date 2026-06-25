/**
 * Unit tests for typed transport errors and pure RPC protocol (PPI-022/034/042).
 */
import { describe, it, expect } from "vitest";

import { DecodeErrorRaised, describeTransportError, invariant, TransportErrorRaised } from "./errors";
import { encodeRpcEnvelope, httpPath, httpTransportError, matchPendingResponse, decodeTransportError, type RequestEnvelope } from "../api/apiProtocol";

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

describe("invariant", () => {
  it("throws on falsy", () => {
    expect(() => invariant(false, "x")).toThrow(/invariant violated: x/);
    expect(() => invariant(null, "y")).toThrow(/invariant violated: y/);
  });

  it("does not throw on truthy", () => {
    invariant(true, "ok");
    invariant(1, "ok");
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

describe("matchPendingResponse", () => {
  it("returns null for non-envelope or wrong id", () => {
    expect(matchPendingResponse(null, 1)).toBeNull();
    expect(matchPendingResponse({ kind: "response", id: 2, result: 1 }, 1)).toBeNull();
    expect(matchPendingResponse({ kind: "other", id: 1 }, 1)).toBeNull();
  });

  it("returns null for a malformed envelope (zod rejects, PPI-022/034)", () => {
    expect(matchPendingResponse({ kind: "response" }, 1)).toBeNull();
    expect(matchPendingResponse({ kind: "response", id: "x", result: 1 }, 1)).toBeNull();
    expect(matchPendingResponse("not-an-object", 1)).toBeNull();
  });

  it("decodes an ok response", () => {
    const matched = matchPendingResponse({ kind: "response", id: 1, result: { ok: true } }, 1);
    expect(matched?.status).toBe("ok");
    if (matched && matched.status === "ok") {
      expect(matched.result).toEqual({ ok: true });
    }
  });

  it("decodes an error response into an rpc transport error", () => {
    const matched = matchPendingResponse(
      { kind: "response", id: 1, error: { code: "X", message: "fail" } },
      1,
    );
    expect(matched?.status).toBe("error");
    if (matched && matched.status === "error") {
      expect(matched.error).toEqual({ kind: "rpc", code: "X", message: "fail" });
    }
  });
});

describe("decodeTransportError", () => {
  it("unwraps a TransportErrorRaised", () => {
    const error = { kind: "http", url: "/x", status: 503, detail: "down" } as const;
    const decoded = decodeTransportError(new TransportErrorRaised(error), { kind: "rpc", code: "X", message: "m" });
    expect(decoded).toEqual(error);
  });

  it("wraps a DecodeErrorRaised as a rpc DECODE error", () => {
    const decoded = decodeTransportError(new DecodeErrorRaised({ kind: "decode", reason: "bad", received: 1 }), {
      kind: "rpc",
      code: "X",
      message: "m",
    });
    expect(decoded.kind).toBe("rpc");
    if (decoded.kind === "rpc") {
      expect(decoded.code).toBe("DECODE");
    }
  });

  it("wraps a plain Error with the fallback code", () => {
    const decoded = decodeTransportError(new Error("boom"), { kind: "rpc", code: "INTERNAL", message: "m" });
    expect(decoded.kind).toBe("rpc");
    if (decoded.kind === "rpc") {
      expect(decoded.code).toBe("INTERNAL");
      expect(decoded.message).toBe("boom");
    }
  });

  it("falls back to the provided value for non-Error throws", () => {
    const fallback = { kind: "rpc", code: "INTERNAL", message: "m" } as const;
    expect(decodeTransportError("string-thrown", fallback)).toBe(fallback);
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