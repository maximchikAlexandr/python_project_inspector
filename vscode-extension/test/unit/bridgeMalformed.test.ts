/** QueryBridge malformed JSON handling (PPI-034): a non-JSON stdout line is
 * logged as a session warning, not thrown. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

import { QueryBridge } from "../../src/queryBridge";

const FAKE = resolve(__dirname, "..", "test", "fixtures", "fake-rpc-malformed.js");

test("malformed non-JSON rpc line logs a warning instead of throwing", async () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => warnings.push(String(msg));
  try {
    const bridge = new QueryBridge({ cliArgs: ["node", FAKE], repo: "/tmp/anywhere" });
    bridge.start();
    for (let i = 0; i < 20 && !warnings.some((w) => /malformed rpc json line/.test(w)); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(warnings.some((w) => /malformed rpc json line/.test(w)), "malformed line should log a warning");
    bridge.dispose();
  } finally {
    console.warn = origWarn;
  }
});