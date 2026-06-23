// Bundles the VS Code extension host entry to dist/extension.js.
// The Webview content is built separately by the frontend (frontend/dist-webview).
import * as esbuild from "esbuild";

const prod = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  sourcemap: !prod,
  minify: prod,
  target: "node20",
  external: ["vscode"],
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
