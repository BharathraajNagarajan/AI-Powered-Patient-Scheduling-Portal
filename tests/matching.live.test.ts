import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import cases from "./fixtures/matching-cases.json";
import { dropTempDb, useTempDb } from "./helpers";

const envFile = path.resolve(".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const live = Boolean(process.env.OPENAI_API_KEY) && process.env.LIVE_TESTS === "1";

describe.skipIf(!live)("live semantic matching", () => {
  beforeAll(() => {
    useTempDb();
    process.env.MOCK_LLM = "false";
  });
  afterAll(dropTempDb);

  for (const testCase of cases.filter((c) => c.kind !== "ambiguous")) {
    it(`${testCase.kind}: ${testCase.text}`, async () => {
      const { matchProvider } = await import("@/lib/matching");
      const result = await matchProvider(testCase.text);
      if (testCase.kind === "unsupported") {
        expect(result.doctor).toBeNull();
      } else {
        expect(result.path).toBe("semantic");
        expect(result.doctor?.specialty).toBe(testCase.expected);
      }
    });
  }
});
