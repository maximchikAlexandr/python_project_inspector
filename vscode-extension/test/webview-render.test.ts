/**
 * Webview render verification (part of T042/FR-007/FR-008): loads the built
 * webview bundle in a real (headless) Chrome with a mocked `acquireVsCodeApi`
 * and asserts the existing App mounts in webview mode. This verifies the
 * webview entry renders without requiring a running VS Code instance.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { statSync, createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";

const DIST = join(__dirname, "..", "dist-webview");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

function serve(root: string): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = decodeURIComponent(req.url ?? "/");
      const path = normalize(join(root, url === "/" ? "/webview.html" : url));
      if (!path.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      let file: string;
      try {
        statSync(path).isFile();
        file = path;
      } catch {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as { port: number }).port, close: () => new Promise((r) => server.close(() => r())) }));
  });
}

test("webview bundle mounts the dashboard App in headless Chrome", async () => {
  const { port, close } = await serve(DIST);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    // Mock the VS Code webview API before any bundle script runs.
    await page.evaluateOnNewDocument(() => {
      (window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
        postMessage: () => undefined,
        getState: () => undefined,
        setState: () => undefined,
      });
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/webview.html`, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.waitForFunction(() => document.getElementById("root")?.childElementCount ?? 0 > 0, { timeout: 30_000 });
    const childCount = await page.evaluate(() => document.getElementById("root")?.childElementCount ?? 0);
    assert.ok(childCount > 0, "the dashboard App should mount into #root in webview mode");
    assert.ok(errors.length === 0, `unexpected page errors: ${errors.join(" | ")}`);
  } finally {
    await browser.close();
    await close();
  }
});
