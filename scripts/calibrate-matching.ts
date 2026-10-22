import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface Case {
  text: string;
  kind: "supported" | "unsupported" | "ambiguous";
  expected: string | null;
}

interface Band {
  high: number;
  low: number;
  margin: number;
}

type Status = "matched" | "uncertain" | "none";

interface Row {
  testCase: Case;
  blocked: boolean;
  top: { specialty: string; score: number }[];
}

function loadEnv(): void {
  const file = path.resolve(".env.local");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + " ".repeat(width - value.length);
}

function fmt(score: number): string {
  return score.toFixed(3);
}

function statusOf(row: Row, band: Band): Status {
  if (row.blocked) return "none";
  const first = row.top[0];
  if (first.score < band.low) return "none";
  const margin = first.score - row.top[1].score;
  return first.score >= band.high && margin >= band.margin ? "matched" : "uncertain";
}

function evaluate(row: Row, band: Band): { status: Status; correct: boolean | null; exact: boolean } {
  const status = statusOf(row, band);
  const { testCase } = row;
  if (testCase.kind === "ambiguous") return { status, correct: null, exact: false };
  if (testCase.kind === "unsupported") return { status, correct: status !== "matched", exact: false };
  const inTop2 = row.top.slice(0, 2).some((t) => t.specialty === testCase.expected);
  const exact = status === "matched" && row.top[0].specialty === testCase.expected;
  return { status, correct: exact || (status === "uncertain" && inTop2), exact };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = Math.round(from * 100); i <= Math.round(to * 100); i++) out.push(i / 100);
  return out;
}

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set. Add it to .env.local and run again.");
    process.exit(1);
  }
  process.env.MOCK_LLM = "false";
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "calibrate-"));

  const { scoreAllProviders, DEFAULT_BAND } = await import("../lib/matching");
  const { getDoctor, isUnsupported } = await import("../lib/doctors");
  const { closeDb } = await import("../lib/db");

  const cases = JSON.parse(
    fs.readFileSync(path.resolve("tests/fixtures/matching-cases.json"), "utf-8")
  ) as Case[];

  const rows: Row[] = [];
  for (const testCase of cases) {
    const ranked = await scoreAllProviders(testCase.text);
    rows.push({
      testCase,
      blocked: isUnsupported(testCase.text),
      top: ranked.map((r) => ({ specialty: getDoctor(r.providerId)?.specialty ?? r.providerId, score: r.score })),
    });
  }

  const scored = rows.filter((r) => r.testCase.kind !== "ambiguous");
  const combos: { band: Band; correct: number; exact: number; unsupportedMatched: number; ambiguousMatched: number }[] = [];
  for (const low of range(0.05, 0.35)) {
    for (const high of range(0.1, 0.6)) {
      if (high < low) continue;
      for (const margin of range(0, 0.15)) {
        const band = { low, high, margin };
        let correct = 0;
        let exact = 0;
        let unsupportedMatched = 0;
        const ambiguousMatched = rows.filter(
          (r) => r.testCase.kind === "ambiguous" && evaluate(r, band).status === "matched"
        ).length;
        for (const row of scored) {
          const result = evaluate(row, band);
          if (result.correct) correct++;
          if (result.exact) exact++;
          if (row.testCase.kind === "unsupported" && result.status === "matched") unsupportedMatched++;
        }
        combos.push({ band, correct, exact, unsupportedMatched, ambiguousMatched });
      }
    }
  }

  const safe = combos.filter((c) => c.unsupportedMatched === 0);
  const bestCorrect = Math.max(...safe.map((c) => c.correct));
  const topCorrect = safe.filter((c) => c.correct === bestCorrect);
  const fewestAmbiguous = Math.min(...topCorrect.map((c) => c.ambiguousMatched));
  const calm = topCorrect.filter((c) => c.ambiguousMatched === fewestAmbiguous);
  const bestExact = Math.max(...calm.map((c) => c.exact));
  const tied = calm.filter((c) => c.exact === bestExact);
  const strictest = [...tied].sort((x, y) => y.band.high - x.band.high || y.band.margin - x.band.margin)[0];
  const group = tied
    .filter((c) => c.band.high === strictest.band.high && c.band.margin === strictest.band.margin)
    .map((c) => c.band.low)
    .sort((x, y) => x - y);
  const chosen: Band = {
    high: strictest.band.high,
    margin: strictest.band.margin,
    low: group[Math.floor((group.length - 1) / 2)],
  };

  const current = combos.find(
    (c) => c.band.low === DEFAULT_BAND.low && c.band.high === DEFAULT_BAND.high && c.band.margin === DEFAULT_BAND.margin
  );

  const header = `${pad("case", 42)} ${pad("kind", 11)} ${pad("expected", 17)} ${pad("top-1", 24)} ${pad("top-2", 24)} ${pad("margin", 6)} ${pad("blk", 3)} ${pad("status", 9)} result`;
  console.log(
    `Table at chosen band: low=${chosen.low.toFixed(2)} high=${chosen.high.toFixed(2)} margin=${chosen.margin.toFixed(2)}\n`
  );
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of rows) {
    const result = evaluate(row, chosen);
    const margin = row.top[0].score - row.top[1].score;
    console.log(
      `${pad(row.testCase.text, 42)} ${pad(row.testCase.kind, 11)} ${pad(row.testCase.expected ?? "none", 17)} ${pad(
        `${row.top[0].specialty} ${fmt(row.top[0].score)}`,
        24
      )} ${pad(`${row.top[1].specialty} ${fmt(row.top[1].score)}`, 24)} ${pad(fmt(margin), 6)} ${pad(
        row.blocked ? "yes" : "no",
        3
      )} ${pad(result.status, 9)} ${result.correct === null ? "report" : result.correct ? "pass" : "FAIL"}`
    );
  }

  console.log("\nSummary");
  console.log(`  cases scored: ${scored.length} (ambiguous cases are report only)`);
  console.log(
    `  best with zero unsupported matched: ${bestCorrect}/${scored.length} correct, ${bestExact} exact matches, ${fewestAmbiguous} ambiguous cases matched, ${tied.length} equivalent bands`
  );
  console.log(
    `  chosen: HIGH_THRESHOLD=${chosen.high.toFixed(2)} LOW_THRESHOLD=${chosen.low.toFixed(2)} MIN_MARGIN=${chosen.margin.toFixed(2)}`
  );
  console.log(
    `  tied range: low ${Math.min(...tied.map((c) => c.band.low)).toFixed(2)}-${Math.max(...tied.map((c) => c.band.low)).toFixed(2)}, high ${Math.min(...tied.map((c) => c.band.high)).toFixed(2)}-${Math.max(...tied.map((c) => c.band.high)).toFixed(2)}, margin ${Math.min(...tied.map((c) => c.band.margin)).toFixed(2)}-${Math.max(...tied.map((c) => c.band.margin)).toFixed(2)}`
  );
  if (current) {
    console.log(
      `  current constants: ${current.correct}/${scored.length} correct, ${current.unsupportedMatched} unsupported matched`
    );
  }

  const failing = scored.filter((r) => evaluate(r, chosen).correct === false);
  if (failing.length > 0) {
    console.log("\nStill failing at the chosen band:");
    for (const r of failing) {
      console.log(
        `  "${r.testCase.text}" expected ${r.testCase.expected ?? "none"}: ${r.top[0].specialty} ${fmt(r.top[0].score)}, ${r.top[1].specialty} ${fmt(r.top[1].score)}`
      );
    }
  }

  if (process.argv.includes("--apply")) {
    const file = path.resolve("lib/matching.ts");
    let source = fs.readFileSync(file, "utf-8");
    source = source
      .replace(/HIGH_THRESHOLD = [0-9.]+;/, `HIGH_THRESHOLD = ${chosen.high.toFixed(2)};`)
      .replace(/LOW_THRESHOLD = [0-9.]+;/, `LOW_THRESHOLD = ${chosen.low.toFixed(2)};`)
      .replace(/MIN_MARGIN = [0-9.]+;/, `MIN_MARGIN = ${chosen.margin.toFixed(2)};`);
    fs.writeFileSync(file, source);
    console.log("\nUpdated the three constants in lib/matching.ts.");
  } else {
    console.log("\nRun with --apply to write these constants into lib/matching.ts.");
  }

  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
