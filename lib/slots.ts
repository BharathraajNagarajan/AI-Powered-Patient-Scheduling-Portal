import { getDb } from "./db";
import { formatSlotLabel } from "./time";
import type { SlotView } from "./types";

export const RESERVATION_MS = 10 * 60 * 1000;
export const OFFER_LIMIT = 24;

export type ReserveResult =
  | { ok: true; slot: SlotView; expiresAt: string }
  | { ok: false; reason: "not_found" | "wrong_provider" | "unavailable" | "no_provider" };

interface SlotRow {
  id: string;
  provider_id: string;
  starts_at: string;
  status: "free" | "reserved" | "booked";
  reserved_by_session: string | null;
  reserved_until: number | null;
}

export function listOfferedSlots(
  providerId: string,
  sessionId: string,
  now: number = Date.now(),
  limit: number = OFFER_LIMIT
): SlotView[] {
  const rows = getDb()
    .prepare(
      `SELECT id, starts_at FROM slots
       WHERE provider_id = ? AND starts_at > ?
         AND (status = 'free'
              OR (status = 'reserved' AND (reserved_until < ? OR reserved_by_session = ?)))
       ORDER BY starts_at LIMIT ?`
    )
    .all(providerId, new Date(now).toISOString(), now, sessionId, limit) as { id: string; starts_at: string }[];
  return rows.map((r) => ({ id: r.id, label: formatSlotLabel(r.starts_at) }));
}

export function getSlot(slotId: string): SlotRow | null {
  return (getDb().prepare("SELECT * FROM slots WHERE id = ?").get(slotId) as SlotRow | undefined) ?? null;
}

export function reserveSlot(sessionId: string, slotId: string, now: number = Date.now()): ReserveResult {
  const db = getDb();
  const run = db.transaction((): ReserveResult => {
    const session = db
      .prepare("SELECT matched_provider_id, selected_slot_id, booking_status FROM sessions WHERE id = ?")
      .get(sessionId) as
      | { matched_provider_id: string | null; selected_slot_id: string | null; booking_status: string }
      | undefined;
    if (!session || !session.matched_provider_id) return { ok: false, reason: "no_provider" };
    if (session.booking_status === "confirmed") return { ok: false, reason: "unavailable" };

    const slot = getSlot(slotId);
    if (!slot) return { ok: false, reason: "not_found" };
    if (slot.provider_id !== session.matched_provider_id) return { ok: false, reason: "wrong_provider" };
    if (new Date(slot.starts_at).getTime() <= now) return { ok: false, reason: "unavailable" };

    const until = now + RESERVATION_MS;
    const claimed = db
      .prepare(
        `UPDATE slots SET status = 'reserved', reserved_by_session = ?, reserved_until = ?
         WHERE id = ? AND (status = 'free' OR (status = 'reserved' AND reserved_until < ?))`
      )
      .run(sessionId, until, slotId, now);

    if (claimed.changes === 0) {
      const refreshed = db
        .prepare(
          `UPDATE slots SET reserved_until = ?
           WHERE id = ? AND status = 'reserved' AND reserved_by_session = ? AND reserved_until >= ?`
        )
        .run(until, slotId, sessionId, now);
      if (refreshed.changes === 0) return { ok: false, reason: "unavailable" };
    }

    if (session.selected_slot_id && session.selected_slot_id !== slotId) {
      db.prepare(
        `UPDATE slots SET status = 'free', reserved_by_session = NULL, reserved_until = NULL
         WHERE id = ? AND status = 'reserved' AND reserved_by_session = ?`
      ).run(session.selected_slot_id, sessionId);
    }

    db.prepare("UPDATE sessions SET selected_slot_id = ?, updated_at = ? WHERE id = ?").run(
      slotId,
      new Date(now).toISOString(),
      sessionId
    );

    return {
      ok: true,
      slot: { id: slotId, label: formatSlotLabel(slot.starts_at) },
      expiresAt: new Date(until).toISOString(),
    };
  });
  return run.immediate();
}
