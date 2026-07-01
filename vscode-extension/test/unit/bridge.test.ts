/** Servant-death handling for QueryBridge (FR-022/FR-023, T027). */
import { test } from "node:test";
import assert from "node:assert/strict";

import { QueryBridge } from "../../src/queryBridge";

const FAKE = require("path").resolve(__dirname, "..", "fixtures", "fake-rpc.js");

test("in-flight request rejects when the ppi rpc servant exits unexpectedly", async () => {
  const bridge = new QueryBridge({ cliArgs: ["node", FAKE], repo: "/tmp/anywhere" });
  bridge.start();
  await assert.rejects(
    bridge.request("project/info"),
    /servant exited unexpectedly/,
    "pending request should reject on servant death",
  );
  bridge.dispose();
});
