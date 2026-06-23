/**
 * CLI executable verification (FR-014).
 *
 * Precedence lives in `cliArgs.resolveCliArgs`; this module proactively verifies
 * the resolved CLI is launchable (so the analyst gets a guided `Open Settings`
 * error before a run starts). The probe is cached per resolved args for the
 * session so repeated "Analyze" clicks do not pay a Python cold start each time.
 */

import { spawnSync } from "node:child_process";

import { CliNotFound } from "./contracts";

const verified = new Set<string>();

/** Proactively verify the resolved CLI is launchable (FR-014), cached per session. */
export function verifyCli(args: string[]): void {
  const key = args.join(" ");
  if (verified.has(key)) {
    return;
  }
  const probe = spawnSync(args[0], [...args.slice(1), "--help"], {
    encoding: "utf-8",
    timeout: 15_000,
  });
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new CliNotFound(
      `Cannot find the ppi CLI (tried: ${args.join(" ")}). Set ppi.pythonExecutable or ppi.cliPath in Settings.`,
    );
  }
  verified.add(key);
}
