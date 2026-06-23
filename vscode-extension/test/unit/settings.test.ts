/** Unit tests for CLI executable resolution precedence (T032/FR-014). */
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveCliArgs } from "../../src/cliArgs";

test("interpreter takes precedence over cliPath and PATH", () => {
  assert.deepEqual(resolveCliArgs({ profile: "odoo", analysisDir: "", pythonExecutable: "/usr/bin/python3", cliPath: "/x/ppi" }), ["/usr/bin/python3", "-m", "ppi"]);
});

test("cliPath is used when no interpreter", () => {
  assert.deepEqual(resolveCliArgs({ profile: "odoo", analysisDir: "", pythonExecutable: "  ", cliPath: "/opt/ppi" }), ["/opt/ppi"]);
});

test("falls back to PATH ppi when nothing configured", () => {
  assert.deepEqual(resolveCliArgs({ profile: "odoo", analysisDir: "", pythonExecutable: "", cliPath: "" }), ["ppi"]);
});

test("whitespace-only settings are treated as unset", () => {
  assert.deepEqual(resolveCliArgs({ profile: "python", analysisDir: " ", pythonExecutable: " ", cliPath: " " }), ["ppi"]);
});
