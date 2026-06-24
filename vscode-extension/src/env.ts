/**
 * CLI executable verification (FR-014).
 *
 * Precedence lives in `cliArgs.resolveCliArgs`; this module proactively verifies
 * the resolved CLI is launchable (so the analyst gets a guided `Open Settings`
 * error before a run starts). The probe is cached per resolved args for the
 * session so repeated "Analyze" clicks do not pay a Python cold start each time.
 *
 * The probe runs the CLI as an async child process so a slow or broken Python
 * environment cannot block the extension host (R-012/R-013 follow-up).
 */

import { spawn } from "node:child_process";

import { CliNotFound } from "./contracts";

const verified = new Set<string>();

/** Proactively verify the resolved CLI is launchable (FR-014), cached per session. */
export async function verifyCli(args: string[]): Promise<void> {
  const key = args.join(" ");
  if (verified.has(key)) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(args[0], [...args.slice(1), "--help"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, 15_000);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
      if (stderr.length > 2000) {
        stderr = stderr.slice(-2000);
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new CliNotFound(
            `Cannot find the ppi CLI (tried: ${args.join(" ")}). Set ppi.pythonExecutable or ppi.cliPath in Settings.`,
          ),
        );
        return;
      }
      reject(new CliNotFound(`ppi CLI check failed: ${err.message}`));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new CliNotFound(
            "ppi CLI check timed out (15s). Set ppi.pythonExecutable or ppi.cliPath in Settings.",
          ),
        );
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim() ? `: ${stderr.slice(0, 500)}` : "";
        reject(
          new CliNotFound(
            `ppi CLI check failed (exit ${code})${detail}. Set ppi.pythonExecutable or ppi.cliPath in Settings.`,
          ),
        );
        return;
      }
      verified.add(key);
      resolve();
    });
  });
}