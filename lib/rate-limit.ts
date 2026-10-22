import { NextResponse } from "next/server";
import { getDb } from "./db";

export interface RateRule {
  limit: number;
  windowMs: number;
}

export const RATE_RULES = {
  session: { limit: 10, windowMs: 60_000 },
  chat: { limit: 30, windowMs: 60_000 },
  book: { limit: 10, windowMs: 60_000 },
  slotsSelect: { limit: 10, windowMs: 60_000 },
  providerSelect: { limit: 10, windowMs: 60_000 },
  initiateCall: { limit: 3, windowMs: 10 * 60_000 },
} satisfies Record<string, RateRule>;

export const RATE_LIMIT_MESSAGE = "You are sending requests too quickly. Please wait a moment and try again.";

export interface RateResult {
  allowed: boolean;
  retryAfterSec: number;
}

export function checkRate(
  ip: string,
  route: string,
  rule: RateRule,
  now: number = Date.now()
): RateResult {
  const db = getDb();
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  const row = db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .get(`${route}:${ip}`, windowStart) as { count: number };
  if (Math.random() < 0.01) {
    db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(now - 60 * 60_000);
  }
  return {
    allowed: row.count <= rule.limit,
    retryAfterSec: Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000)),
  };
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

export function enforceRate(req: Request, route: string, rule: RateRule): NextResponse | null {
  const result = checkRate(clientIp(req), route, rule);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: RATE_LIMIT_MESSAGE },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}
