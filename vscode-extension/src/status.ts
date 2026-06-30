/**
 * Status-bar item and notifications for analysis runs (FR-002/003/004/014).
 */

import * as vscode from "vscode";

import type { ProgressEvent } from "./contracts";

export class StatusController {
  private readonly item: vscode.StatusBarItem;
  private activeRunCount = 0;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = "ppi.analyze";
  }

  dispose(): void {
    this.item.dispose();
  }

  setProgress(label: string): void {
    this.item.text = `$(sync~spin) ${label}`;
    this.item.tooltip = label;
    this.item.show();
  }

  setRunning(folder: string): void {
    this.activeRunCount++;
    this.item.text = `$(sync~spin) PPI: analyzing`;
    this.item.tooltip = `Analyzing ${folder}`;
    this.item.show();
  }

  setIdle(): void {
    // Only hide when ALL concurrent runs finish (FR-006 allows one run per folder).
    this.activeRunCount = Math.max(0, this.activeRunCount - 1);
    if (this.activeRunCount === 0) {
      this.item.hide();
    }
  }

  setError(message: string): void {
    this.item.text = `$(error) PPI`;
    this.item.tooltip = message;
    this.item.show();
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
