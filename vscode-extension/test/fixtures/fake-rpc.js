// Fake `ppi rpc` that exits without responding, to test servant-death handling.
const stdin = process.stdin;
stdin.resume();
stdin.setEncoding("utf-8");
stdin.on("data", () => {
  // Deliberately do not write a response; exit so the bridge must surface failure.
  process.exit(0);
});
