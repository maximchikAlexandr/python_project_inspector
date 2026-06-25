/** Unit tests for typed bridge errors (PPI-034). */
import { test } from "node:test";
import assert from "node:assert/strict";

import { BridgeErrorRaised, describeBridgeError, invariant, type BridgeError } from "../../src/errors";

test("describeBridgeError formats each error kind", () => {
  const cases: Array<[BridgeError, RegExp]> = [
    [{ kind: "rpc_process", reason: "spawn_failed", message: "no binary" }, /rpc process spawn_failed: no binary/],
    [{ kind: "rpc_request", reason: "timeout", method: "graph", message: "slow" }, /rpc request timeout \(graph\): slow/],
    [{ kind: "rpc_protocol", message: "unmatched id 7" }, /rpc protocol: unmatched id 7/],
    [{ kind: "cli_lifeline", message: "boom" }, /cli lifeline: boom/],
  ];
  for (const [error, re] of cases) {
    assert.match(describeBridgeError(error), re);
  }
});

test("BridgeErrorRaised carries the typed error value", () => {
  const error: BridgeError = { kind: "rpc_protocol", message: "x" };
  const raised = new BridgeErrorRaised(error);
  assert.equal(raised.error, error);
  assert.equal(raised.name, "BridgeErrorRaised");
});

test("invariant throws on falsy conditions", () => {
  assert.throws(() => invariant(false, "bad"), /invariant violated: bad/);
  assert.throws(() => invariant(null, "bad"), /invariant violated: bad/);
  assert.throws(() => invariant(undefined, "bad"), /invariant violated: bad/);
});

test("invariant does not throw on truthy conditions", () => {
  invariant(true, "ok");
  invariant(1, "ok");
  invariant("non-empty", "ok");
});