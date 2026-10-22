import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isUnsupported, matchDoctor } from "@/lib/doctors";
import { cosine, MATCH_THRESHOLD, matchProvider, pickMatch, rankProviders } from "@/lib/matching";
import { dropTempDb, useTempDb } from "./helpers";

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

  it("applies the threshold at the boundary", () => {
    expect(MATCH_THRESHOLD).toBe(0.35);
    expect(pickMatch([{ providerId: "a", score: 0.35 }])?.providerId).toBe("a");
    expect(pickMatch([{ providerId: "a", score: 0.3499 }])).toBeNull();
    expect(pickMatch([])).toBeNull();
    expect(pickMatch([{ providerId: "a", score: 0.5 }], 0.6)).toBeNull();
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
    expect(result.doctor?.specialty).toBe("Dermatology");
  });

  it("returns no match for unsupported conditions", async () => {
    const result = await matchProvider("vision problems");
    expect(result.path).toBe("unsupported");
    expect(result.doctor).toBeNull();
  });

  it("returns none when nothing matches", async () => {
    const result = await matchProvider("general tiredness");
    expect(result.path).toBe("none");
    expect(result.doctor).toBeNull();
  });
});
