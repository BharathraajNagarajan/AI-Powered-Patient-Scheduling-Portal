import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { ensureSlots, slotId } from "@/lib/slot-seed";
import { listOfferedSlots, RESERVATION_MS, reserveSlot } from "@/lib/slots";
import { formatSlotLabel } from "@/lib/time";
import { dropTempDb, firstFreeSlotId, newSession, useTempDb } from "./helpers";

beforeEach(useTempDb);
afterEach(dropTempDb);

describe("slot seeding", () => {
  it("is idempotent and weekday only", () => {
    const before = (getDb().prepare("SELECT COUNT(*) AS n FROM slots").get() as { n: number }).n;
    expect(before).toBeGreaterThan(0);
    expect(ensureSlots(getDb())).toBe(0);
    const rows = getDb().prepare("SELECT starts_at FROM slots").all() as { starts_at: string }[];
    for (const row of rows) {
      const weekday = formatSlotLabel(row.starts_at).split(",")[0];
      expect(["Saturday", "Sunday"]).not.toContain(weekday);
    }
  });

  it("derives deterministic ids", () => {
    expect(slotId("doc-001", "2030-01-01T17:00:00.000Z")).toBe(slotId("doc-001", "2030-01-01T17:00:00.000Z"));
    expect(slotId("doc-001", "2030-01-01T17:00:00.000Z")).not.toBe(slotId("doc-002", "2030-01-01T17:00:00.000Z"));
  });

  it("formats labels in the clinic timezone", () => {
    expect(formatSlotLabel("2030-01-15T17:00:00.000Z")).toBe("Tuesday, January 15, 2030 at 9:00 AM");
    expect(formatSlotLabel("2030-07-16T16:00:00.000Z")).toBe("Tuesday, July 16, 2030 at 9:00 AM");
  });
});

describe("reservation", () => {
  it("reserves a free slot for one session only", () => {
    const a = newSession();
    const b = newSession();
    const slot = firstFreeSlotId();
    expect(reserveSlot(a, slot).ok).toBe(true);
    const second = reserveSlot(b, slot);
    expect(second.ok).toBe(false);
  });

  it("treats expired reservations as free", () => {
    const a = newSession();
    const b = newSession();
    const slot = firstFreeSlotId();
    const now = Date.now();
    expect(reserveSlot(a, slot, now).ok).toBe(true);
    expect(reserveSlot(b, slot, now + RESERVATION_MS - 1000).ok).toBe(false);
    expect(reserveSlot(b, slot, now + RESERVATION_MS + 1000).ok).toBe(true);
  });

  it("lists expired reservations as free", () => {
    const a = newSession();
    const b = newSession();
    const slot = firstFreeSlotId();
    const now = Date.now();
    reserveSlot(a, slot, now);
    expect(listOfferedSlots("doc-001", b, now).some((s) => s.id === slot)).toBe(false);
    expect(listOfferedSlots("doc-001", b, now + RESERVATION_MS + 1000).some((s) => s.id === slot)).toBe(true);
  });

  it("releases the previous reservation when another slot is chosen", () => {
    const a = newSession();
    const first = firstFreeSlotId("doc-001", 0);
    const second = firstFreeSlotId("doc-001", 1);
    reserveSlot(a, first);
    reserveSlot(a, second);
    const row = getDb().prepare("SELECT status FROM slots WHERE id = ?").get(first) as { status: string };
    expect(row.status).toBe("free");
  });

  it("keeps the previous hold when the new slot is taken", () => {
    const a = newSession();
    const b = newSession();
    const first = firstFreeSlotId("doc-001", 0);
    const second = firstFreeSlotId("doc-001", 1);
    reserveSlot(a, first);
    reserveSlot(b, second);
    expect(reserveSlot(a, second).ok).toBe(false);
    const row = getDb().prepare("SELECT status, reserved_by_session FROM slots WHERE id = ?").get(first) as {
      status: string;
      reserved_by_session: string;
    };
    expect(row).toEqual({ status: "reserved", reserved_by_session: a });
  });

  it("rejects slots from another provider", () => {
    const a = newSession("doc-001");
    const other = firstFreeSlotId("doc-002");
    const result = reserveSlot(a, other);
    expect(result).toEqual({ ok: false, reason: "wrong_provider" });
  });

  it("rejects unknown slots and unmatched sessions", () => {
    expect(reserveSlot(newSession(), "missing")).toEqual({ ok: false, reason: "not_found" });
    expect(reserveSlot(newSession(null), firstFreeSlotId())).toEqual({ ok: false, reason: "no_provider" });
  });
});
