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
        retainContextWhenHidden: false,
        localResourceRoots: [this.distWebviewUri(), this.mediaUri()],
      },
    );
    this.bridge = new QueryBridge({ cliArgs: options.cliArgs, repo: options.repo, analysisDir: options.analysisDir });
    this.bridge.start();
    const media = this.mediaUri();
    this.panel.iconPath = {
      light: media.with({ path: `${media.path}/icon-light.svg` }),
      dark: media.with({ path: `${media.path}/icon-dark.svg` }),
    };
    this.panel.webview.html = "";
    void this.renderHtml();
    this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg), undefined, this.disposables);
    this.panel.onDidDispose(() => {
      if (!this.disposed) {
        this.dispose();
      }
    }, undefined, this.disposables);
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
    html = html.replace(/(href|src)=["']\/?assets\//g, (_m, attr) => {
      return `${attr}="${webview.asWebviewUri(vscode.Uri.joinPath(base, "assets"))}/`;
    });
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
      const status = await this.bridge.request<{ store_present: boolean; schema_compatible: boolean }>("status");
      if (!status.store_present) {
        void vscode.window
          .showInformationMessage("PPI: no analysis results yet for this folder.", "Run analysis")
          .then((action) => {
            if (action === "Run analysis") {
              void vscode.commands.executeCommand("ppi.analyze");
            }
          });
      } else if (status.schema_compatible === false) {
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
    if (typeof message !== "object" || message === null) {
      return;
    }
    const msg = message as { kind?: string; id?: number; method?: string; params?: Record<string, unknown>; command?: string };
    if (msg.kind === "request" && msg.id !== undefined && msg.method) {
      const sessionError = this.bridge.sessionErrorMessage;
      if (sessionError) {
        this.panel.webview.postMessage({
          kind: "response",
          id: msg.id,
          error: { code: "TRANSPORT_ERROR", message: sessionError },
        });
        return;
      }
      try {
        const result = await this.bridge.request(msg.method, msg.params ?? {});
        this.panel.webview.postMessage({ kind: "response", id: msg.id, result });
      } catch (err) {
        this.panel.webview.postMessage({
          kind: "response",
          id: msg.id,
          error: { code: "INTERNAL", message: (err as Error).message },
        });
      }
    } else if (msg.kind === "command" && msg.command) {
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

  postEvent(event: string, data: Record<string, unknown> = {}): void {
    if (this.disposed) {
      return;
    }
    void this.panel.webview.postMessage({ kind: "event", event, ...data });
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
  }
}
