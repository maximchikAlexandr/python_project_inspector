import * as esbuild from "esbuild";
import { mkdir, rm } from "node:fs/promises";

await rm("dist-test", { recursive: true, force: true });
await mkdir("dist-test", { recursive: true });

const entries = {
  "test/unit/analyzeRunner.test.ts": "dist-test/analyzeRunner.test.js",
  "test/unit/settings.test.ts": "dist-test/settings.test.js",
  "test/unit/cancel.test.ts": "dist-test/cancel.test.js",
  "test/unit/errors.test.ts": "dist-test/errors.test.js",
  "test/unit/webviewMessages.test.ts": "dist-test/webviewMessages.test.js",
  "test/dashboard.test.ts": "dist-test/dashboard.test.js",
  "test/unit/bridge.test.ts": "dist-test/bridge.test.js",
  "test/webview-render.test.ts": "dist-test/webview-render.test.js",
};

for (const [entry, outfile] of Object.entries(entries)) {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    outfile,
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["vscode", "puppeteer-core"],
    logLevel: "warning",
  });
}
