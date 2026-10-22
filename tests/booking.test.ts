import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notify", () => ({
  sendBookingEmail: vi.fn().mockResolvedValue(undefined),
  sendBookingSms: vi.fn().mockResolvedValue(undefined),
}));

import { bookSession } from "@/lib/booking";
import { getDb } from "@/lib/db";
import { RESERVATION_MS, reserveSlot } from "@/lib/slots";
import { getSession } from "@/lib/sessions";
import { sendBookingEmail } from "@/lib/notify";
import { dropTempDb, firstFreeSlotId, newSession, useTempDb } from "./helpers";

beforeEach(useTempDb);
afterEach(dropTempDb);

describe("booking", () => {
  it("books a held slot and records it", () => {
    const id = newSession();
    const slot = firstFreeSlotId();
    reserveSlot(id, slot);
    const result = bookSession(id);
    expect(result.ok).toBe(true);
    expect(getSession(id)?.bookingStatus).toBe("confirmed");
    const row = getDb().prepare("SELECT status FROM slots WHERE id = ?").get(slot) as { status: string };
    expect(row.status).toBe("booked");
    expect(sendBookingEmail).toHaveBeenCalled();
  });

  it("is idempotent for a confirmed session", () => {
    const id = newSession();
    reserveSlot(id, firstFreeSlotId());
    const first = bookSession(id);
    const second = bookSession(id);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.booking.bookingId).toBe(first.booking.bookingId);
      expect(second.booking.alreadyConfirmed).toBe(true);
    }
    expect((getDb().prepare("SELECT COUNT(*) AS n FROM bookings").get() as { n: number }).n).toBe(1);
  });

  it("rejects booking without a reservation", () => {
    expect(bookSession(newSession())).toEqual({ ok: false, reason: "no_reservation" });
  });

  it("rejects booking after the hold expires", () => {
    const id = newSession();
    const now = Date.now();
    reserveSlot(id, firstFreeSlotId(), now);
    expect(bookSession(id, now + RESERVATION_MS + 1000)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects booking when another session took the expired slot", () => {
    const a = newSession();
    const b = newSession();
    const slot = firstFreeSlotId();
    const now = Date.now();
    reserveSlot(a, slot, now);
    reserveSlot(b, slot, now + RESERVATION_MS + 1000);
    expect(bookSession(a, now + RESERVATION_MS + 2000).ok).toBe(false);
    expect(bookSession(b, now + RESERVATION_MS + 2000).ok).toBe(true);
  });

  it("lets exactly one of 20 parallel sessions book one slot", async () => {
    const slot = firstFreeSlotId();
    const ids = Array.from({ length: 20 }, () => newSession());
    const results = await Promise.all(
      ids.map(async (id) => {
        const reserved = reserveSlot(id, slot);
        if (!reserved.ok) return false;
        return bookSession(id).ok;
      })
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((getDb().prepare("SELECT COUNT(*) AS n FROM bookings WHERE slot_id = ?").get(slot) as { n: number }).n).toBe(1);
  });

  it("blocks a second booking on a slot at the database level", () => {
    const a = newSession();
    const b = newSession();
    const slot = firstFreeSlotId();
    reserveSlot(a, slot);
    bookSession(a);
    const insert = () =>
      getDb()
        .prepare("INSERT INTO bookings (id, session_id, slot_id, created_at) VALUES ('x', ?, ?, 'now')")
        .run(b, slot);
    expect(insert).toThrow(/UNIQUE/);
  });
});
