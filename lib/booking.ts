import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { getDoctor } from "./doctors";
import { sendBookingEmail, sendBookingSms } from "./notify";
import { log } from "./log";
import { getSession } from "./sessions";
import { formatSlotLabel } from "./time";

export interface BookingDetails {
  bookingId: string;
  providerName: string;
  specialty: string;
  label: string;
  alreadyConfirmed: boolean;
}

export type BookResult =
  | { ok: true; booking: BookingDetails }
  | { ok: false; reason: "not_found" | "no_reservation" | "expired" | "conflict" };

export function generateBookingId(): string {
  return `BKG-${randomUUID().split("-")[0].toUpperCase()}`;
}

function isConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    String((err as { code?: string }).code).startsWith("SQLITE_CONSTRAINT")
  );
}

export function bookSession(sessionId: string, now: number = Date.now()): BookResult {
  const db = getDb();
  const run = db.transaction((): BookResult => {
    const session = db
      .prepare("SELECT matched_provider_id, selected_slot_id, booking_status, booking_id FROM sessions WHERE id = ?")
      .get(sessionId) as
      | {
          matched_provider_id: string | null;
          selected_slot_id: string | null;
          booking_status: string;
          booking_id: string | null;
        }
      | undefined;
    if (!session) return { ok: false, reason: "not_found" };

    const doctor = session.matched_provider_id ? getDoctor(session.matched_provider_id) : null;
    if (!doctor || !session.selected_slot_id) return { ok: false, reason: "no_reservation" };

    const slot = db
      .prepare("SELECT starts_at, status, reserved_by_session, reserved_until FROM slots WHERE id = ?")
      .get(session.selected_slot_id) as
      | { starts_at: string; status: string; reserved_by_session: string | null; reserved_until: number | null }
      | undefined;
    if (!slot) return { ok: false, reason: "no_reservation" };

    const label = formatSlotLabel(slot.starts_at);
    const base = { providerName: doctor.name, specialty: doctor.specialty, label };

    if (session.booking_status === "confirmed" && session.booking_id) {
      return { ok: true, booking: { ...base, bookingId: session.booking_id, alreadyConfirmed: true } };
    }

    if (slot.status !== "reserved" || slot.reserved_by_session !== sessionId) {
      return { ok: false, reason: slot.status === "booked" ? "conflict" : "no_reservation" };
    }
    if (slot.reserved_until === null || slot.reserved_until < now) return { ok: false, reason: "expired" };

    const claimed = db
      .prepare(
        `UPDATE slots SET status = 'booked', reserved_until = NULL
         WHERE id = ? AND status = 'reserved' AND reserved_by_session = ? AND reserved_until >= ?`
      )
      .run(session.selected_slot_id, sessionId, now);
    if (claimed.changes === 0) return { ok: false, reason: "conflict" };

    const bookingId = generateBookingId();
    const stamp = new Date(now).toISOString();
    db.prepare("INSERT INTO bookings (id, session_id, slot_id, created_at) VALUES (?, ?, ?, ?)").run(
      bookingId,
      sessionId,
      session.selected_slot_id,
      stamp
    );
    db.prepare("UPDATE sessions SET booking_status = 'confirmed', booking_id = ?, updated_at = ? WHERE id = ?").run(
      bookingId,
      stamp,
      sessionId
    );
    return { ok: true, booking: { ...base, bookingId, alreadyConfirmed: false } };
  });

  let result: BookResult;
  try {
    result = run.immediate();
  } catch (err) {
    if (isConstraintError(err)) return { ok: false, reason: "conflict" };
    throw err;
  }

  if (result.ok && !result.booking.alreadyConfirmed) {
    const session = getSession(sessionId);
    if (session) {
      const details = {
        patientName: session.patientName,
        email: session.email,
        phone: session.phone,
        chiefComplaint: session.chiefComplaint,
        providerName: result.booking.providerName,
        specialty: result.booking.specialty,
        label: result.booking.label,
        bookingId: result.booking.bookingId,
      };
      void sendBookingEmail(details).catch((err) => log("error", "email_failed", { sessionId, error: err }));
      if (session.smsOptIn) {
        void sendBookingSms(details).catch((err) => log("error", "sms_failed", { sessionId, error: err }));
      }
    }
  }
  return result;
}
