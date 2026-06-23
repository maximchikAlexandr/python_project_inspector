/**
 * Resolve effective PPI settings for a workspace folder.
 *
 * VS Code provides workspace-over-global precedence natively for `resource`
 * scope settings (FR-012); `machine-overridable` scope settings are resolved
 * globally here and may be overridden per-machine by the user.
 */

import * as vscode from "vscode";

import type { PpiSettings } from "./cliArgs";


const SECTION = "ppi";

/** Read effective settings for a workspace folder (or globally when null). */
export function readSettings(folder: vscode.WorkspaceFolder | null): PpiSettings {
  const cfg = vscode.workspace.getConfiguration(SECTION, folder ?? null);
  return {
    profile: (cfg.get<string>("profile") as "python" | "odoo") ?? "odoo",
    analysisDir: cfg.get<string>("analysisDir") ?? "",
    pythonExecutable: cfg.get<string>("pythonExecutable") ?? "",
    cliPath: cfg.get<string>("cliPath") ?? "",
  };
}
