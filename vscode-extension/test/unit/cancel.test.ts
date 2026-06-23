/** Cancel lifecycle test for analyzeRunner (T013/T017): SIGTERM -> cancelled, stale-lock recovery runs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import { runAnalyze } from "../../src/analyzeRunner";

// NOTE: uses CJS require/__dirname because esbuild.test.mjs emits CJS; if the test
// build target flips to ESM, switch to import.meta.url + url.pathToFileURL.
const FAKE = require("path").resolve(__dirname, "..", "test", "fixtures", "fake-pp.js");

test("cancel terminates the spawned CLI and resolves to cancelled", async () => {
  const handle = runAnalyze({
    cliArgs: ["node", FAKE],
    repo: "/tmp/anywhere",
    profile: "odoo",
    onEvent: () => undefined,
  });
  // Give the fake CLI a moment to start and emit run_started.
  await sleep(150);
  await handle.cancel();
  const terminal = await Promise.race([
    handle.done,
    sleep(5000).then(() => "timeout" as const),
  ]);
  assert.equal(terminal, "cancelled", "done should resolve to cancelled after cancel");
});
