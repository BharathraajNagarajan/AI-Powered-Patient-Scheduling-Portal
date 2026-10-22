import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { doctors } from "./doctors";
import { clinicToday, parseClockTime, zonedToUtcIso } from "./time";

export function slotHorizonDays(): number {
  const parsed = Number.parseInt(process.env.SLOT_HORIZON_DAYS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 730) : 60;
}

export function slotId(providerId: string, startsAt: string): string {
  return createHash("sha256").update(`${providerId}|${startsAt}`).digest("hex").slice(0, 24);
}

export function ensureSlots(db: Database.Database, now: Date = new Date()): number {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO slots (id, provider_id, starts_at, status) VALUES (?, ?, ?, 'free')"
  );
  const today = clinicToday(now);
  const horizon = slotHorizonDays();
  let added = 0;
  db.transaction(() => {
    for (let offset = 1; offset <= horizon; offset++) {
      const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
      const weekday = day.getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      for (const doctor of doctors) {
        for (const time of doctor.times) {
          const { hour, minute } = parseClockTime(time);
          const startsAt = zonedToUtcIso(
            day.getUTCFullYear(),
            day.getUTCMonth() + 1,
            day.getUTCDate(),
            hour,
            minute
          );
          added += insert.run(slotId(doctor.id, startsAt), doctor.id, startsAt).changes;
        }
      }
    }
  }).immediate();
  return added;
}
