/**
 * Pure CLI argument resolution (FR-014), free of ``vscode`` so it is unit-testable.
 *
 * Precedence: configured Python interpreter (``<exe> -m ppi``) -> configured CLI
 * path -> the ``ppi`` console script on PATH.
 */

export interface PpiSettings {
  readonly profile: "python" | "odoo";
  readonly analysisDir: string;
  readonly pythonExecutable: string;
  readonly cliPath: string;
}

export function resolveCliArgs(settings: PpiSettings): string[] {
  if (settings.pythonExecutable.trim()) {
    return [settings.pythonExecutable.trim(), "-m", "ppi"];
  }
  if (settings.cliPath.trim()) {
    return [settings.cliPath.trim()];
  }
  return ["ppi"];
}
