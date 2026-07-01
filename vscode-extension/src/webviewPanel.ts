/**
 * Webview panel host for the embedded dashboard (FR-007/008/009/010/022).
 *
 * Hosts the existing frontend bundle built to `frontend/dist-webview`, routes
 * request/response messages to a `QueryBridge` (`ppi rpc`), and applies a
 * strict CSP with a per-load nonce. No HTTP server is started (decision C).
 */

import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { QueryBridge } from "./queryBridge";
import { WebviewMessageSchema } from "./webviewMessages";

const WEBVIEW_ID = "ppi.dashboard";

// Closed enum from contracts/webview-bridge.md; module-level so it is not
// rebuilt per message. Matches the contributed `ppi.*` command ids, not the
// generic `workbench.action.openSettings`, so the contract-compliant message
// from the Webview passes the allowlist.
const ALLOWED_COMMANDS = new Set([
  "ppi.analyze",
  "ppi.cancelAnalysis",
  "ppi.openSettings",
]);

// Read-only `ppi rpc` methods the dashboard may invoke; anything else is rejected.
// Mirrors the Python QueryMethod enum (src/ppi/query/dispatch.py); update both
// together if the CLI query surface grows (contracts/query-rpc.md is canonical).
const ALLOWED_RPC_METHODS = new Set([
  "commits",
  "metrics/timeseries",
  "hotspots",
  "graph",
  "ui/config",
  "snapshot/table/modules",
  "snapshot/table/files",
  "snapshot/relations",
  "project/info",
]);

export interface DashboardPanelOptions {
  readonly extensionUri: vscode.Uri;
  readonly cliArgs: string[];
  readonly repo: string;
  readonly analysisDir?: string;
  readonly onDispose?: () => void;
}

export class DashboardPanel {
  private readonly panel: vscode.WebviewPanel;
  private readonly bridge: QueryBridge;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly nonce = randomBytes(16).toString("base64");
  private disposed = false;

  constructor(private readonly options: DashboardPanelOptions, column: vscode.ViewColumn) {
    this.panel = vscode.window.createWebviewPanel(
      WEBVIEW_ID,
      "PPI Dashboard",
      column,
      {
        enableScripts: true,
        // Retain context when hidden so dashboard state survives move/dock (FR-009/FR-026).
        // ponytail: switch to getState/setState if memory footprint matters across many panels.
        retainContextWhenHidden: true,
        localResourceRoots: [this.distWebviewUri(), this.mediaUri()],
      },
    );
    this.bridge = new QueryBridge({ cliArgs: options.cliArgs, repo: options.repo, analysisDir: options.analysisDir });
    // Lazy-start: the bridge starts on first request, not in the constructor,
    // so opening the dashboard doesn't hold a DuckDB read lock until the user
    // actually queries (#14/#21).
    const media = this.mediaUri();
    this.panel.iconPath = {
      light: media.with({ path: `${media.path}/icon-light.svg` }),
      dark: media.with({ path: `${media.path}/icon-dark.svg` }),
    };
    void this.renderHtml();
    this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg), undefined, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  reveal(column: vscode.ViewColumn): void {
    this.panel.reveal(column);
  }

  private distWebviewUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.options.extensionUri, "dist-webview");
  }

  private mediaUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.options.extensionUri, "media");
  }

  private async renderHtml(): Promise<void> {
    const indexHtml = vscode.Uri.joinPath(this.distWebviewUri(), "webview.html");
    let html: string;
    try {
      html = await readFile(indexHtml.fsPath, "utf-8");
    } catch {
      this.panel.webview.html = this.fallbackHtml();
      void vscode.window.showErrorMessage(
        "PPI: dashboard bundle not found. Build it: cd frontend && npm run build:webview",
      );
      return;
    }
    const webview = this.panel.webview;
    const base = this.distWebviewUri();
    const assetsUri = webview.asWebviewUri(vscode.Uri.joinPath(base, "assets"));
    // Rewrite asset references to vscode-resource URIs (vite `base: "./"` emits relative ./assets/).
    html = html.replace(/((?:href|src)=["'])(\.\/)?\/?assets\//g, (_m, attr) => `${attr}${assetsUri.toString()}/`);
    // Add the nonce to script tags so the CSP permits them; drop crossorigin.
    html = html.replace(/\s?crossorigin/g, "");
    html = html.replace(/<script\b/g, `<script nonce="${this.nonce}"`);
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${this.nonce}'`,
    ].join("; ");
    html = html.replace(
      /<head[^>]*>/i,
      (m) => `${m}<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );
    this.panel.webview.html = html;
    void this.checkEmptyState();
  }

  /** Show a clear empty-state path when there is no completed analysis (FR-010). */
  private async checkEmptyState(): Promise<void> {
    try {
      const info = await this.bridge.request<{ store_present: boolean; schema_version?: number }>("project/info");
      if (!info.store_present) {
        void vscode.window
          .showInformationMessage("PPI: no analysis results yet for this folder.", "Run analysis")
          .then((action) => {
            if (action === "Run analysis") {
              void vscode.commands.executeCommand("ppi.analyze");
            }
          });
      } else if (info.schema_version === undefined) {
        void vscode.window
          .showWarningMessage("PPI: stored analysis is incompatible. Re-run with rebuild.", "Re-run")
          .then((action) => {
            if (action === "Re-run") {
              void vscode.commands.executeCommand("ppi.analyze");
            }
          });
      }
    } catch {
      // Bridge not ready yet; the dashboard will surface store status itself.
    }
  }

  private async onMessage(message: unknown): Promise<void> {
    // Validate incoming JSON through zod (PPI-034): a malformed message is
    // ignored rather than crashing the panel.
    const parsed = WebviewMessageSchema.safeParse(message);
    if (!parsed.success) {
      return;
    }
    const msg = parsed.data;
    if (msg.kind === "request") {
      if (!ALLOWED_RPC_METHODS.has(msg.method)) {
        this.panel.webview.postMessage({
          kind: "response",
          status: "error",
          id: msg.id,
          error: { code: "METHOD_NOT_ALLOWED", message: `rpc method not allowed: ${msg.method}` },
        });
        return;
      }
      // No sessionError gate: bridge.request() self-heals via lazy restart
      // (FR-023). Gating here would prevent the restart that clears the error.
      try {
        const result = await this.bridge.request(msg.method, msg.params ?? {});
        this.panel.webview.postMessage({ kind: "response", status: "ok", id: msg.id, result });
      } catch (err) {
        this.panel.webview.postMessage({
          kind: "response",
          status: "error",
          id: msg.id,
          error: { code: "INTERNAL", message: (err as Error).message },
        });
      }
    } else if (msg.kind === "command") {
      // Closed enum from contracts/webview-bridge.md.
      if (ALLOWED_COMMANDS.has(msg.command)) {
        void vscode.commands.executeCommand(msg.command);
      }
    }
  }

  private fallbackHtml(): string {
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">
      PPI dashboard bundle not found. Build it with <code>cd frontend &amp;&amp; npm run build:webview</code>.
    </body></html>`;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.options.onDispose?.();
    this.bridge.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    // No-op if already disposing (e.g. triggered by onDidDispose).
    this.panel.dispose();
  }
}
