// Minimal fake `ppi` for testing analyzeRunner cancel + doctor recovery.
// - argv contains "analyze": emit a run_started event then wait forever.
// - argv contains "doctor": exit 0 immediately (stale-lock recovery probe).
// - argv contains "--help": exit 0 (verifyCli probe).
const argv = process.argv;
if (argv.includes("--help") || argv.includes("doctor")) {
  process.exit(0);
}
if (argv.includes("analyze")) {
  process.stdout.write(
    JSON.stringify({ type: "run_started", run_id: "fake", branch: "main", mode: "incremental", commits_total: 1 }) + "\n",
  );
  // Hold the process open so the runner can cancel it.
  setInterval(() => {}, 60000);
}
