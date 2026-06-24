/**
 * Extension entry point: command registration and analysis run management.
 *
 * The extension is a thin client (FR-015): it only spawns the CLI and surfaces
 * progress/results. Analysis and storage stay owned by `ppi`. One analysis run
 * per workspace folder at a time (FR-006); re-invoking offers cancel (FR-020).
 */

import * as vscode from "vscode";

import { runAnalyze, type RunHandle } from "./analyzeRunner";
import { DashboardPanel } from "./webviewPanel";
import { CliNotFound, type ProgressEvent, type RunFailed } from "./contracts";
import { resolveCliArgs } from "./cliArgs";
import { verifyCli } from "./env";
import { readSettings } from "./settings";
import { StatusController, errorWithActions, infoWithAction } from "./status";

let output: vscode.OutputChannel;

const activeRuns = new Map<string, RunHandle>();
const panels = new Map<string, DashboardPanel>();
let extensionUri: vscode.Uri;
let status: StatusController;

// Maps internal progress event types to the Webview event names from
// contracts/webview-bridge.md. Module-level so it is not rebuilt per event.
const PROGRESS_EVENT_NAME: Record<string, string> = {
  run_started: "runStarted",
  commit_progress: "progress",
  run_completed: "runCompleted",
  run_failed: "runFailed",
};


export function activate(context: vscode.ExtensionContext): void {
  extensionUri = context.extensionUri;
  status = new StatusController();
  output = vscode.window.createOutputChannel("PPI");
  context.subscriptions.push(status, output);

  context.subscriptions.push(
    vscode.commands.registerCommand("ppi.analyze", () => runAnalyzeCommand()),
    vscode.commands.registerCommand("ppi.cancelAnalysis", () => cancelAnalysisCommand()),
    vscode.commands.registerCommand("ppi.openDashboard", () => openDashboardCommand()),
    vscode.commands.registerCommand("ppi.analyzeRebuild", () => runAnalyzeCommand(true)),
    vscode.commands.registerCommand("ppi.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "ppi")),
  );

  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    status.show();
  }
}

async function tryVerifyCli(cliArgs: string[]): Promise<boolean> {
  try {
    await verifyCli(cliArgs);
    return true;
  } catch (err) {
    if (err instanceof CliNotFound) {
      const action = await errorWithActions(err.message, ["Open Settings"]);
      if (action === "Open Settings") {
        void vscode.commands.executeCommand("workbench.action.openSettings", "ppi.pythonExecutable");
      }
    } else {
      void vscode.window.showErrorMessage(`PPI: ${(err as Error).message}`);
    }
    return false;
  }
}

export async function deactivate(): Promise<void> {
  await Promise.allSettled([...activeRuns.values()].map((h) => h.cancel()));
  for (const panel of panels.values()) {
    panel.dispose();
  }
  panels.clear();
}

/** Pick the target folder (FR-017): single folder -> that; many -> QuickPick. */
async function pickFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscode.window.showInformationMessage("PPI: open a workspace folder first.");
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }
  const picks = folders.map((f) => ({ label: f.name, description: f.uri.fsPath, folder: f }));
  const choice = await vscode.window.showQuickPick(picks, { placeHolder: "Select folder to analyze" });
  return choice?.folder;
}

async function runAnalyzeCommand(rebuild = false): Promise<void> {
  const folder = await pickFolder();
  if (!folder) {
    return;
  }
  const folderKey = folder.uri.toString();

  const existing = activeRuns.get(folderKey);
  if (existing) {
    const choice = await vscode.window.showWarningMessage(
      "PPI: an analysis is already running for this folder.",
      "Cancel it",
    );
    if (choice === "Cancel it") {
      await existing.cancel();
    }
    return;
  }

  const settings = readSettings(folder);
  const cliArgs = resolveCliArgs(settings);
  if (!await tryVerifyCli(cliArgs)) return;

  status.setRunning(folder.name);

  const handle = runAnalyze({
    cliArgs,
    repo: folder.uri.fsPath,
    profile: settings.profile,
    analysisDir: settings.analysisDir,
    rebuild,
    onEvent: (event) => onProgress(event, folder.name, folderKey),
  });
  activeRuns.set(folderKey, handle);

  const terminal = await handle.done;
  activeRuns.delete(folderKey);
  status.setIdle();

  if (terminal === "cancelled") {
    void vscode.window.showInformationMessage("PPI: analysis cancelled.");
    return;
  }
  if (terminal.type === "run_failed") {
    onRunFailed(terminal as RunFailed, handle.stderrTail);
    return;
  }
  // run_completed
  const t = terminal as { type: "run_completed"; commits_succeeded: number; commits_failed: number };
  const ok = await infoWithAction(
    `PPI: analysis completed (${t.commits_succeeded} ok, ${t.commits_failed} failed).`,
    "View Dashboard",
  );
  if (ok) {
    void vscode.commands.executeCommand("ppi.openDashboard");
  }
}

function onProgress(event: ProgressEvent, folderName: string, folderKey: string): void {
  if (event.type === "run_started" || event.type === "commit_progress") {
    status.setProgress(status.labelFor(event, folderName));
  }
  const panel = panels.get(folderKey);
  if (panel) {
    const mappedEvent = PROGRESS_EVENT_NAME[event.type];
    if (mappedEvent) {
      panel.postEvent(mappedEvent, event as unknown as Record<string, unknown>);
    }
  }
}

function onRunFailed(failed: RunFailed, stderrTail: string): void {
  status.setError(failed.message);
  const needsRebuild = failed.exit_reason === "schema_incompatible" || /rerun with --rebuild|rerun analyze with profile/i.test(failed.message);
  // Surface the failing CLI output so the analyst can diagnose without leaving the editor (FR-004/SC-006).
  if (stderrTail.trim() || failed.stderr_tail?.trim()) {
    output.clear();
    output.appendLine(`PPI analysis failed: ${failed.message}`);
    output.appendLine("----- ppi stderr -----");
    output.appendLine(stderrTail || failed.stderr_tail || "(no stderr captured)");
    output.show();
  }
  const actions = needsRebuild ? ["Re-run with rebuild", "Show output"] : ["Retry", "Show output"];
  void errorWithActions(`PPI: analysis failed — ${failed.message}`, actions).then((action) => {
    if (action === "Retry") {
      void vscode.commands.executeCommand("ppi.analyze");
    } else if (action === "Re-run with rebuild") {
      void vscode.commands.executeCommand("ppi.analyzeRebuild");
    } else if (action === "Show output") {
      output.show();
    }
  });
}

async function cancelAnalysisCommand(): Promise<void> {
  const folder = await pickFolder();
  if (!folder) {
    return;
  }
  const key = folder.uri.toString();
  const handle = activeRuns.get(key);
  if (!handle) {
    void vscode.window.showInformationMessage("PPI: no analysis is running for this folder.");
    return;
  }
  await handle.cancel();
  const panel = panels.get(key);
  if (panel) {
    panel.postEvent("runCancelled");
  }
}

async function openDashboardCommand(): Promise<void> {
  const folder = await pickFolder();
  if (!folder) {
    return;
  }
  const settings = readSettings(folder);
  const cliArgs = resolveCliArgs(settings);
  if (!await tryVerifyCli(cliArgs)) return;
  const key = folder.uri.toString();
  const existing = panels.get(key);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Active);
    return;
  }
  const panel = new DashboardPanel(
    { extensionUri, cliArgs, repo: folder.uri.fsPath, analysisDir: settings.analysisDir, onDispose: () => panels.delete(key) },
    vscode.ViewColumn.Active,
  );
  panels.set(key, panel);
}
