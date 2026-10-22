import { getDb } from "./db";
import { ERROR_MESSAGES } from "./errors";
import { log } from "./log";
import { saveConversation } from "./memory";
import { officeInfo } from "./office-info";
import { normalizePhone } from "./validation";
import { bookingView, getSession, MAX_CALLS_PER_SESSION, providerView, reservationView, type Session } from "./sessions";

export const CALL_COOLDOWN_MS = 2 * 60 * 1000;

export type CallResult =
  | { ok: true; callId: string; callsRemaining: number }
  | { ok: false; status: number; error: string };

export function buildVoiceSummary(session: Session): string {
  const parts = [`Patient: ${session.patientName}`, `Complaint: ${session.chiefComplaint}`];
  const provider = providerView(session);
  if (provider) parts.push(`Matched: ${provider.name} (${provider.specialty})`);
  const booking = bookingView(session);
  const held = reservationView(session);
  if (booking) {
    parts.push(`Appointment: ${booking.label}, confirmed`);
    parts.push(`Booking ID: ${booking.bookingId}`);
  } else if (held) {
    parts.push(`Time held: ${held.label}, pending confirmation`);
  }
  return parts.join(". ");
}

export function buildFirstMessage(session: Session): string {
  const firstName = session.patientName.split(" ")[0];
  const provider = providerView(session);
  const booking = bookingView(session);
  const intro = `Hi ${firstName}, this is Aria calling from ${officeInfo.name}.`;
  if (booking) {
    return `${intro} I'm continuing from our web chat. Your appointment with ${booking.provider} on ${booking.label} is confirmed. Your booking ID is ${booking.bookingId}. Is there anything else I can help you with today?`;
  }
  if (provider) {
    return `${intro} I'm continuing from our chat. We were working on scheduling an appointment with ${provider.name} for your ${session.chiefComplaint}. Shall we continue?`;
  }
  return `${intro} I'm continuing from our web chat about your ${session.chiefComplaint}. How can I help you today?`;
}

function claimCall(sessionId: string, now: number): { ok: true; previous: { last: number | null; count: number } } | { ok: false; status: number; error: string } {
  const db = getDb();
  const run = db.transaction(() => {
    const row = db.prepare("SELECT last_call_at, call_count FROM sessions WHERE id = ?").get(sessionId) as
      | { last_call_at: number | null; call_count: number }
      | undefined;
    if (!row) return { ok: false as const, status: 404, error: ERROR_MESSAGES.sessionNotFound };
    if (row.call_count >= MAX_CALLS_PER_SESSION) return { ok: false as const, status: 429, error: ERROR_MESSAGES.callLimit };
    if (row.last_call_at !== null && now - row.last_call_at < CALL_COOLDOWN_MS) {
      return { ok: false as const, status: 429, error: ERROR_MESSAGES.callTooSoon };
    }
    db.prepare("UPDATE sessions SET last_call_at = ?, call_count = call_count + 1 WHERE id = ?").run(now, sessionId);
    return { ok: true as const, previous: { last: row.last_call_at, count: row.call_count } };
  });
  return run.immediate();
}

function releaseCall(sessionId: string, previous: { last: number | null; count: number }): void {
  getDb()
    .prepare("UPDATE sessions SET last_call_at = ?, call_count = ? WHERE id = ?")
    .run(previous.last, previous.count, sessionId);
}

export async function placeCall(sessionId: string, now: number = Date.now()): Promise<CallResult> {
  const claim = claimCall(sessionId, now);
  if (!claim.ok) return claim;

  const session = getSession(sessionId) as Session;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.vapi.ai/call/phone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        assistantId: process.env.VAPI_ASSISTANT_ID,
        assistantOverrides: {
          firstMessage: buildFirstMessage(session),
          variableValues: {
            patientName: session.patientName,
            chiefComplaint: session.chiefComplaint,
            doctorName: providerView(session)?.name ?? "",
            specialty: providerView(session)?.specialty ?? "",
            slotDatetime: bookingView(session)?.label ?? reservationView(session)?.label ?? "",
            bookingId: session.bookingId ?? "",
            bookingStatus: session.bookingStatus,
            voiceSummary: buildVoiceSummary(session),
            clinicName: officeInfo.name,
          },
        },
        customer: { number: normalizePhone(session.phone), name: session.patientName },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      releaseCall(sessionId, claim.previous);
      log("error", "vapi_call_failed", { sessionId, status: response.status });
      return { ok: false, status: 502, error: ERROR_MESSAGES.callFailed };
    }

    const data = (await response.json()) as { id?: string };
    saveConversation(session.phone, sessionId);
    log("info", "vapi_call_started", { sessionId, callId: data.id, phone: session.phone });
    return {
      ok: true,
      callId: data.id ?? "",
      callsRemaining: Math.max(0, MAX_CALLS_PER_SESSION - (claim.previous.count + 1)),
    };
  } catch (err) {
    releaseCall(sessionId, claim.previous);
    log("error", "vapi_call_error", { sessionId, error: err });
    return { ok: false, status: 502, error: ERROR_MESSAGES.callFailed };
  } finally {
    clearTimeout(timeout);
  }
}
