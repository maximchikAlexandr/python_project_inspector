/**
 * Unit tests for the DataSource method->URL mapping (T030).
 *
 * Runs under vitest. Validates that HttpDataSource maps method names + params
 * to the same HTTP routes the browser dashboard uses, so the Webview and browser
 * share one query surface (Spec FR-018/SC-003).
 */
import { describe, it, expect } from "vitest";

import { httpPath, WebviewDataSource } from "./dataSource";

describe("httpPath", () => {
  it("maps plain methods to query-string URLs", () => {
    expect(httpPath("graph", { commit: "abc", include_zero_score: true })).toBe(
      "/api/graph?commit=abc&include_zero_score=true",
    );
    expect(httpPath("project/info", {})).toBe("/api/project/info");
    expect(httpPath("ui/config", {})).toBe("/api/ui/config");
  });

  it("omits empty/undefined params", () => {
    expect(httpPath("snapshot/table/files", { commit: undefined, module: "m" })).toBe(
      "/api/snapshot/table/files?module=m",
    );
    expect(httpPath("snapshot/table/modules", { commit: "" })).toBe("/api/snapshot/table/modules");
  });

});

describe("WebviewDataSource.post (A1 — no __body envelope)", () => {
  it("sends the body directly as params so the bridge receives real method params", async () => {
    const posted: unknown[] = [];
    const fakeApi = {
      postMessage: (m: unknown) => {
        posted.push(m);
      },
    };
    const g = globalThis as unknown as { acquireVsCodeApi?: () => unknown; window?: EventTarget };
    const originalAcquire = g.acquireVsCodeApi;
    const originalWindow = g.window;
    g.acquireVsCodeApi = () => fakeApi;
    g.window = new EventTarget();
    try {
      const ds = new WebviewDataSource();
      const pending = ds.post("snapshot/relations", {
        commit: "abc",
      });
      expect(posted.length).toBe(1);
      const envelope = posted[0] as { kind: string; method: string; params: Record<string, unknown> };
      expect(envelope.kind).toBe("request");
      expect(envelope.method).toBe("snapshot/relations");
      expect(envelope.params).toEqual({
        commit: "abc",
      });
      expect("__body" in envelope.params).toBe(false);
      expect("__post" in envelope.params).toBe(false);
      g.window!.dispatchEvent(new MessageEvent("message", { data: { kind: "response", status: "ok", id: 1, result: {} } }));
      await pending;
    } finally {
      if (originalAcquire) g.acquireVsCodeApi = originalAcquire;
      else delete g.acquireVsCodeApi;
      if (originalWindow) g.window = originalWindow;
      else delete g.window;
    }
  });
});
