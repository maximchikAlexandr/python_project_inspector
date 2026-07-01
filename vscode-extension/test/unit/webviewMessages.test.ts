/** Unit tests for webview message zod validation (PPI-034). */
import { test } from "node:test";
import assert from "node:assert/strict";

import { WebviewMessageSchema } from "../../src/webviewMessages";

test("parses a request message", () => {
  const parsed = WebviewMessageSchema.safeParse({ kind: "request", id: 1, method: "graph", params: { x: 1 } });
  assert.ok(parsed.success);
  if (parsed.success) {
    assert.equal(parsed.data.kind, "request");
  }
});

test("parses a command message", () => {
  const parsed = WebviewMessageSchema.safeParse({ kind: "command", command: "ppi.analyze" });
  assert.ok(parsed.success);
  if (parsed.success) {
    assert.equal(parsed.data.kind, "command");
    if (parsed.data.kind === "command") {
      assert.equal(parsed.data.command, "ppi.analyze");
    }
  }
});

test("rejects a malformed message", () => {
  assert.equal(WebviewMessageSchema.safeParse(null).success, false);
  assert.equal(WebviewMessageSchema.safeParse({ kind: "request" }).success, false);
  assert.equal(WebviewMessageSchema.safeParse({ kind: "command" }).success, false);
  assert.equal(WebviewMessageSchema.safeParse({ kind: "other" }).success, false);
  assert.equal(WebviewMessageSchema.safeParse(42).success, false);
});

test("request message tolerates missing params", () => {
  const parsed = WebviewMessageSchema.safeParse({ kind: "request", id: 1, method: "project/info" });
  assert.ok(parsed.success);
});