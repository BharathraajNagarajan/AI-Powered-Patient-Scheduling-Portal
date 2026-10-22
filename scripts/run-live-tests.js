const { spawnSync } = require("node:child_process");

const result = spawnSync("npx", ["vitest", "run", "tests/matching.live.test.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, LIVE_TESTS: "1" },
});

process.exit(result.status ?? 1);
