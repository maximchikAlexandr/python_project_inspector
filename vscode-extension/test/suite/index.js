// Extension integration suite (loaded by @vscode/test-electron's host).
// Verifies the extension activates and its commands are registered (T031/T042).
const assert = require("node:assert");
const vscode = require("vscode");

async function run() {
  const extension = vscode.extensions.getExtension("ppi.ppi-vscode");
  assert.ok(extension, "ppi-vscode extension should be present");
  if (extension && !extension.isActive) {
    await extension.activate();
  }
  const commands = await vscode.commands.getCommands();
  for (const cmd of ["ppi.analyze", "ppi.analyzeRebuild", "ppi.openDashboard", "ppi.cancelAnalysis"]) {
    assert.ok(commands.includes(cmd), `command ${cmd} should be registered`);
  }
}

module.exports = { run };
