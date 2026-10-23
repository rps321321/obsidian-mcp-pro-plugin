import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "tests/runtime.test.mjs"],
  { stdio: "inherit", timeout: 90_000 },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
