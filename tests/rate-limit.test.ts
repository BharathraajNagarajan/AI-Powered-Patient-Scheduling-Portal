import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkRate, clientIp } from "@/lib/rate-limit";
import { dropTempDb, useTempDb } from "./helpers";

beforeEach(useTempDb);
afterEach(dropTempDb);

const rule = { limit: 3, windowMs: 60_000 };

describe("rate limiter", () => {
  it("allows up to the limit then blocks", () => {
    const now = 1_700_000_000_000;
    const results = [1, 2, 3, 4, 5].map(() => checkRate("1.1.1.1", "/api/x", rule, now).allowed);
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("tracks ip and route separately", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 4; i++) checkRate("1.1.1.1", "/api/x", rule, now);
    expect(checkRate("2.2.2.2", "/api/x", rule, now).allowed).toBe(true);
    expect(checkRate("1.1.1.1", "/api/y", rule, now).allowed).toBe(true);
  });

  it("resets in the next window and reports retry time", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 4; i++) checkRate("1.1.1.1", "/api/x", rule, now);
    const blocked = checkRate("1.1.1.1", "/api/x", rule, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
    expect(checkRate("1.1.1.1", "/api/x", rule, now + 60_000).allowed).toBe(true);
  });

  it("uses the first hop of x-forwarded-for", () => {
    const req = new Request("http://localhost/x", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
    expect(clientIp(req)).toBe("9.9.9.9");
    expect(clientIp(new Request("http://localhost/x"))).toBe("unknown");
  });
});
