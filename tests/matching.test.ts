import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isUnsupported, matchDoctor } from "@/lib/doctors";
import {
  classifyScores,
  cosine,
  DEFAULT_BAND,
  HIGH_THRESHOLD,
  LOW_THRESHOLD,
  matchProvider,
  MIN_MARGIN,
  rankProviders,
} from "@/lib/matching";
import { dropTempDb, useTempDb } from "./helpers";

const band = { high: 0.5, low: 0.2, margin: 0.25 };
const top = (first: number, second: number) => [
  { providerId: "a", score: first },
  { providerId: "b", score: second },
];

describe("cosine and ranking", () => {
  it("computes cosine similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it("returns the top two providers with scores", () => {
    const ranked = rankProviders(
      [1, 0, 0],
      [
        { providerId: "a", vector: [0, 1, 0] },
        { providerId: "b", vector: [1, 0.1, 0] },
        { providerId: "c", vector: [0.5, 0.5, 0] },
      ]
    );
    expect(ranked.map((r) => r.providerId)).toEqual(["b", "c"]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});

describe("confidence band", () => {
  it("keeps the constants in one consistent place", () => {
    expect(LOW_THRESHOLD).toBeLessThanOrEqual(HIGH_THRESHOLD);
    expect(DEFAULT_BAND).toEqual({ high: HIGH_THRESHOLD, low: LOW_THRESHOLD, margin: MIN_MARGIN });
  });

  it("matches when the top score is high and the margin is wide", () => {
    expect(classifyScores(top(0.75, 0.5), band)).toBe("matched");
    expect(classifyScores(top(0.9, 0.1), band)).toBe("matched");
  });

  it("is uncertain when the margin is too small", () => {
    expect(classifyScores(top(0.75, 0.55), band)).toBe("uncertain");
  });

  it("is uncertain when the top score is between the thresholds", () => {
    expect(classifyScores(top(0.4, 0.05), band)).toBe("uncertain");
    expect(classifyScores(top(0.2, 0.0), band)).toBe("uncertain");
  });

  it("returns none below the low threshold or without scores", () => {
    expect(classifyScores(top(0.19, 0.0), band)).toBe("none");
    expect(classifyScores([], band)).toBe("none");
  });

  it("classifies fixed vectors end to end", () => {
    const providers = [
      { providerId: "a", vector: [1, 0, 0, 0, 0] },
      { providerId: "b", vector: [0, 1, 0, 0, 0] },
      { providerId: "c", vector: [0, 0, 1, 0, 0] },
    ];
    expect(classifyScores(rankProviders([1, 0.05, 0, 0, 0], providers), band)).toBe("matched");
    expect(classifyScores(rankProviders([1, 0.9, 0, 0, 0], providers), band)).toBe("uncertain");
    expect(classifyScores(rankProviders([0.1, 0.1, 0.1, 3, 3], providers), band)).toBe("none");
  });
});

describe("keyword matching", () => {
  it("matches whole words only", () => {
    expect(matchDoctor("my knee hurts")?.specialty).toBe("Orthopedics");
    expect(matchDoctor("frequent heartburn")?.specialty).toBe("Gastroenterology");
    expect(matchDoctor("I need feedback on forms")).toBeNull();
  });

  it("does not flag heart conditions as unsupported ear problems", () => {
    expect(isUnsupported("heart palpitations")).toBe(false);
    expect(isUnsupported("my ear hurts")).toBe(true);
    expect(isUnsupported("dental pain")).toBe(true);
  });
});

describe("matchProvider", () => {
  beforeEach(useTempDb);
  afterEach(dropTempDb);

  it("uses the keyword path when the model is mocked", async () => {
    const result = await matchProvider("itchy skin rash");
    expect(result.path).toBe("keyword");
    expect(result.status).toBe("matched");
    expect(result.doctor?.specialty).toBe("Dermatology");
  });

  it("returns none for unsupported conditions", async () => {
    const result = await matchProvider("vision problems");
    expect(result.path).toBe("unsupported");
    expect(result.status).toBe("none");
    expect(result.doctor).toBeNull();
  });

  it("returns none when nothing matches", async () => {
    const result = await matchProvider("general tiredness");
    expect(result.path).toBe("none");
    expect(result.status).toBe("none");
  });
});
