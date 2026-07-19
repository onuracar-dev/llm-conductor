import { spawnSync } from "node:child_process";

if (process.env.WORKERS_CI !== "1") {
  process.exit(0);
}

const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("npm_execpath is unavailable; run this helper through npm.");
}

for (const args of [["--prefix", "website", "ci"], ["--prefix", "website", "run", "build"]]) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { stdio: "inherit" });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
