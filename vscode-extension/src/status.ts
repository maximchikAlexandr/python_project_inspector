/**
 * Status-bar item and notifications for analysis runs (FR-002/003/004/014).
 */

import * as vscode from "vscode";

import type { ProgressEvent } from "./contracts";

export class StatusController {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = "ppi.analyze";
    this.item.text = "$(pulse) PPI";
    this.item.tooltip = "Python Project Inspector";
  }

  show(): void {
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }

  setProgress(label: string): void {
    this.item.text = `$(sync~spin) ${label}`;
    this.item.tooltip = label;
  }

  setRunning(folder: string): void {
    this.item.text = `$(sync~spin) PPI: analyzing`;
    this.item.tooltip = `Analyzing ${folder}`;
  }

  setIdle(): void {
    this.item.text = "$(pulse) PPI";
    this.item.tooltip = "Python Project Inspector — click to analyze";
  }

  setError(message: string): void {
    this.item.text = `$(error) PPI`;
    this.item.tooltip = message;
  }

  /** Map a progress event to a status-bar label. */
  labelFor(event: ProgressEvent, folder: string): string {
    if (event.type === "run_started") {
      return `PPI: analyzing ${event.branch}`;
    }
    if (event.type === "commit_progress") {
      return `PPI: ${event.processed}/${event.commits_total} ${event.short_hash}`;
    }
    return `PPI: analyzing ${folder}`;
  }
}

/** Show an information message with an optional action; resolve to the action. */
export async function infoWithAction(message: string, action: string): Promise<boolean> {
  const choice = await vscode.window.showInformationMessage(message, action);
  return choice === action;
}

/** Show an error message with actions; resolve to the chosen action or undefined. */
export async function errorWithActions(message: string, actions: string[]): Promise<string | undefined> {
  return vscode.window.showErrorMessage(message, ...actions);
}
