/**
 * Dashboard data-path integration test (T031): QueryBridge (ppi rpc) serves
 * real `status` and `graph` responses over a fixture store, end-to-end.
 *
 * This is the runnable, environment-portable equivalent of the webview
 * end-to-end check: it exercises the same path the dashboard panel uses
 * (WebviewDataSource -> extension -> QueryBridge -> ppi rpc -> dispatch),
 * minus the VS Code GUI which cannot run headlessly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { QueryBridge } from "../src/queryBridge";

const REPO_ROOT = resolve(__dirname, "..", "..");
const CLI_ARGS = ["uv", "run", "--project", REPO_ROOT, "ppi"];

function makeFixtureRepo(root: string): string {
  const repo = mkdtempSync(join(root, "ppi-dash-"));
  const mod = join(repo, "demo_module");
  mkdirSync(mod);
  writeFileSync(join(mod, "__manifest__.py"), '{"name":"demo","depends":[]}\n');
  writeFileSync(join(mod, "__init__.py"), "");
  writeFileSync(join(mod, "models.py"), "class Demo:\n    pass\n");
  spawnSync("git", ["init", "-q", repo], { encoding: "utf-8" });
  spawnSync("git", ["-C", repo, "config", "user.email", "t@e.com"], { encoding: "utf-8" });
  spawnSync("git", ["-C", repo, "config", "user.name", "T"], { encoding: "utf-8" });
  spawnSync("git", ["-C", repo, "add", "."], { encoding: "utf-8" });
  spawnSync("git", ["-C", repo, "commit", "-qm", "init"], { encoding: "utf-8" });
  return repo;
}

test("QueryBridge serves status and graph over a fixture store", async () => {
  const repo = makeFixtureRepo(tmpdir());
  const analysisDir = mkdtempSync(join(tmpdir(), "ppi-dash-analysis-"));
  try {
    const analyze = spawnSync(
      CLI_ARGS[0],
      [...CLI_ARGS.slice(1), "--repo", repo, "--profile", "odoo", "--analysis-dir", analysisDir, "analyze"],
      { encoding: "utf-8", cwd: REPO_ROOT, timeout: 120_000 },
    );
    assert.equal(analyze.status, 0, analyze.stderr || analyze.stdout);

    const bridge = new QueryBridge({ cliArgs: CLI_ARGS, repo, analysisDir });
    bridge.start();
    try {
      const status = bridge.request<{ store_present: boolean; commit_count: number }>("status");
      const graph = bridge.request<{ commit_hash: string | null; nodes: unknown[] }>("graph");
      const s = await status;
      assert.ok(s.store_present, "store should be present after analyze");
      assert.ok(s.commit_count >= 1, "store should have at least one commit");
      const g = await graph;
      assert.ok(g.commit_hash, "graph should resolve a commit hash");
      assert.ok(Array.isArray(g.nodes), "graph should return a nodes array");
    } finally {
      bridge.dispose();
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(analysisDir, { recursive: true, force: true });
  }
});
