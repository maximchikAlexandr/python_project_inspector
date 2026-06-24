/** Unit tests for analyzeRunner pure helpers (T017). */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAnalyzeArgv, parseProgressChunk, parseProgressLine } from "../../src/analyzeRunner";

test("buildAnalyzeArgv orders global flags before the subcommand", () => {
  const argv = buildAnalyzeArgv({
    cliArgs: ["python3", "-m", "ppi"],
    repo: "/repo",
    profile: "odoo",
    analysisDir: "/store",
    onEvent: () => undefined,
  });
  assert.deepEqual(argv, ["python3", "-m", "ppi", "--repo", "/repo", "--profile", "odoo", "--analysis-dir", "/store", "analyze", "--json"]);
});

test("buildAnalyzeArgv omits analysis-dir when empty", () => {
  const argv = buildAnalyzeArgv({
    cliArgs: ["ppi"],
    repo: "/repo",
    profile: "odoo",
    analysisDir: "  ",
    onEvent: () => undefined,
  });
  assert.deepEqual(argv, ["ppi", "--repo", "/repo", "--profile", "odoo", "analyze", "--json"]);
});

test("parseProgressLine decodes a run_started event", () => {
  const e = parseProgressLine('{"type":"run_started","run_id":"x","branch":"main","mode":"incremental","commits_total":2}');
  assert.equal(e?.type, "run_started");
});

test("parseProgressLine returns null for noise", () => {
  assert.equal(parseProgressLine(""), null);
  assert.equal(parseProgressLine("not json"), null);
  assert.equal(parseProgressLine('{"foo":1}'), null);
});

test("parseProgressChunk splits lines and keeps a partial trailing line", () => {
  const { events, rest } = parseProgressChunk(
    "",
    '{"type":"run_started","run_id":"x","branch":"main","mode":"incremental","commits_total":1}\n{"type":"commit_progress","processed":1,"commits_total":1,"short_hash":"abcd1234"}\n{"type":"run_complet',
  );
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "run_started");
  assert.equal(events[1].type, "commit_progress");
  assert.equal(rest, '{"type":"run_complet');
});

test("parseProgressChunk continues from a previous partial line", () => {
  const { events, rest } = parseProgressChunk(
    '{"type":"run_complet',
    'ed","run_id":"x","commits_succeeded":1,"commits_failed":0,"duration_ms":5}\n',
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "run_completed");
  assert.equal(rest, "");
});
