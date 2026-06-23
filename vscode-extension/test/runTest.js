// Integration test runner via @vscode/test-electron (downloads its own VS Code).
// Uses short user-data/extensions dirs under /tmp to avoid the macOS IPC socket
// path-length limit (>103 chars) caused by the long repo path.
const os = require("node:os");
const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "..");
    const extensionTestsPath = path.resolve(__dirname, "suite", "index.js");
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        `--user-data-dir=${path.join(os.tmpdir(), "ppi-vscode-ud")}`,
        `--extensions-dir=${path.join(os.tmpdir(), "ppi-vscode-ext")}`,
      ],
    });
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

void main();
