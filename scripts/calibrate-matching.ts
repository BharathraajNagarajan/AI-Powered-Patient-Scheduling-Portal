import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface Case {
  text: string;
  kind: "supported" | "unsupported" | "ambiguous";
  expected: string | null;
}

interface Row {
  testCase: Case;
  blocked: boolean;
  top1: { specialty: string; score: number };
  top2: { specialty: string; score: number };
}

function loadEnv(): void {
  const file = path.resolve(".env.local");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

function passes(row: Row, threshold: number): boolean | null {
  const { testCase, blocked, top1 } = row;
  if (testCase.kind === "ambiguous") return null;
  if (testCase.kind === "unsupported") return blocked || top1.score < threshold;
  return !blocked && top1.specialty === testCase.expected && top1.score >= threshold;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + " ".repeat(width - value.length);
}

function fmt(score: number): string {
  return score.toFixed(3);
}

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set. Add it to .env.local and run again.");
    process.exit(1);
  }
  process.env.MOCK_LLM = "false";
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "calibrate-"));

  const { scoreAllProviders, MATCH_THRESHOLD } = await import("../lib/matching");
  const { getDoctor, isUnsupported } = await import("../lib/doctors");
  const { closeDb } = await import("../lib/db");

  const cases = JSON.parse(
    fs.readFileSync(path.resolve("tests/fixtures/matching-cases.json"), "utf-8")
  ) as Case[];

  const rows: Row[] = [];
  for (const testCase of cases) {
    const ranked = await scoreAllProviders(testCase.text);
    const describe = (i: number) => ({
      specialty: getDoctor(ranked[i].providerId)?.specialty ?? ranked[i].providerId,
      score: ranked[i].score,
    });
    rows.push({ testCase, blocked: isUnsupported(testCase.text), top1: describe(0), top2: describe(1) });
  }

  const header = `${pad("case", 44)} ${pad("kind", 11)} ${pad("expected", 17)} ${pad("top-1", 24)} ${pad("top-2", 24)} ${pad("block", 5)} result`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of rows) {
    const result = passes(row, MATCH_THRESHOLD);
    console.log(
      `${pad(row.testCase.text, 44)} ${pad(row.testCase.kind, 11)} ${pad(row.testCase.expected ?? "none", 17)} ${pad(
        `${row.top1.specialty} ${fmt(row.top1.score)}`,
        24
      )} ${pad(`${row.top2.specialty} ${fmt(row.top2.score)}`, 24)} ${pad(row.blocked ? "yes" : "no", 5)} ${
        result === null ? "report" : result ? "pass" : "FAIL"
      }`
    );
  }

  const scored = rows.filter((r) => r.testCase.kind !== "ambiguous");
  const sweep: { threshold: number; correct: number }[] = [];
  for (let t = 5; t <= 80; t++) {
    const threshold = t / 100;
    sweep.push({ threshold, correct: scored.filter((r) => passes(r, threshold)).length });
  }
  const best = Math.max(...sweep.map((s) => s.correct));
  const bestThresholds = sweep.filter((s) => s.correct === best).map((s) => s.threshold);
  const runs: number[][] = [];
  for (const t of bestThresholds) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(t - last[last.length - 1] - 0.01) < 1e-9) last.push(t);
    else runs.push([t]);
  }
  const longest = runs.reduce((a, b) => (b.length > a.length ? b : a));
  const recommended = Number(longest[Math.floor((longest.length - 1) / 2)].toFixed(2));

  console.log("\nThreshold sweep (correct out of " + scored.length + "):");
  for (const s of sweep.filter((x) => Math.round(x.threshold * 100) % 5 === 0)) {
    console.log(`  ${s.threshold.toFixed(2)}  ${s.correct}/${scored.length}`);
  }

  const wrongTop1 = rows.filter(
    (r) => r.testCase.kind === "supported" && r.top1.specialty !== r.testCase.expected
  );
  const supportedHits = rows.filter(
    (r) => r.testCase.kind === "supported" && r.top1.specialty === r.testCase.expected
  );
  const unsupportedOpen = rows.filter((r) => r.testCase.kind === "unsupported" && !r.blocked);
  const minSupported = Math.min(...supportedHits.map((r) => r.top1.score));
  const maxUnsupported = unsupportedOpen.length ? Math.max(...unsupportedOpen.map((r) => r.top1.score)) : null;

  console.log("\nSummary");
  console.log(`  best accuracy: ${best}/${scored.length} for thresholds ${longest[0].toFixed(2)} to ${longest[longest.length - 1].toFixed(2)}`);
  console.log(`  recommended MATCH_THRESHOLD: ${recommended.toFixed(2)} (current ${MATCH_THRESHOLD})`);
  console.log(`  lowest correct supported score: ${fmt(minSupported)}`);
  console.log(
    `  highest score among unsupported cases the blocklist misses: ${maxUnsupported === null ? "n/a" : fmt(maxUnsupported)}`
  );

  if (wrongTop1.length > 0) {
    console.log("\nFails at every threshold (wrong top-1 provider):");
    for (const r of wrongTop1) {
      console.log(`  "${r.testCase.text}" expected ${r.testCase.expected}, got ${r.top1.specialty} ${fmt(r.top1.score)}`);
    }
    console.log("  Fix: enrich the provider profile text in lib/doctors.ts (providerProfile) with symptoms in plain language.");
  }
  if (maxUnsupported !== null && maxUnsupported >= minSupported) {
    console.log("\nUnsupported and supported scores overlap. No single threshold separates them.");
    console.log("  Fix: extend UNSUPPORTED_CONDITIONS in lib/doctors.ts for the missed unsupported cases.");
  }

  if (process.argv.includes("--apply")) {
    const file = path.resolve("lib/matching.ts");
    const source = fs.readFileSync(file, "utf-8");
    fs.writeFileSync(file, source.replace(/MATCH_THRESHOLD = [0-9.]+;/, `MATCH_THRESHOLD = ${recommended.toFixed(2)};`));
    console.log(`\nUpdated MATCH_THRESHOLD in lib/matching.ts to ${recommended.toFixed(2)}.`);
  } else {
    console.log("\nRun with --apply to write the recommended threshold into lib/matching.ts.");
  }

  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
