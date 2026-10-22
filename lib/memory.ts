import { getDb } from "./db";
import { getSession, providerView, bookingView, type Session } from "./sessions";
import { phoneKey } from "./validation";
import { log } from "./log";

export interface StoredConversation {
  phone: string;
  patientName: string;
  session: Session;
  lastUpdated: string;
  callCount: number;
}

export function saveConversation(phone: string, sessionId: string): void {
  const key = phoneKey(phone);
  getDb()
    .prepare(
      `INSERT INTO call_memory (phone, session_id, call_count, updated_at) VALUES (?, ?, 1, ?)
       ON CONFLICT (phone) DO UPDATE SET
         session_id = excluded.session_id,
         call_count = call_count + 1,
         updated_at = excluded.updated_at`
    )
    .run(key, sessionId, new Date().toISOString());
  log("info", "memory_saved", { phone });
}

export function getConversation(phone: string): StoredConversation | null {
  const key = phoneKey(phone);
  const row = getDb().prepare("SELECT * FROM call_memory WHERE phone = ?").get(key) as
    | { phone: string; session_id: string; call_count: number; updated_at: string }
    | undefined;
  if (!row) return null;
  const session = getSession(row.session_id);
  if (!session) return null;
  return {
    phone: row.phone,
    patientName: session.patientName,
    session,
    lastUpdated: row.updated_at,
    callCount: row.call_count,
  };
}

export function buildRecallGreeting(stored: StoredConversation): string {
  const { patientName, session, callCount } = stored;
  const firstName = patientName.split(" ")[0];
  const provider = providerView(session);
  const booking = bookingView(session);

  if (booking) {
    return `Welcome back, ${firstName}! I can see you have an appointment scheduled with ${booking.provider} on ${booking.label}. Your booking ID is ${booking.bookingId}. How can I help you today?`;
  }
  if (provider) {
    return `Welcome back, ${firstName}! Last time we were working on scheduling an appointment with ${provider.name} for your ${session.chiefComplaint}. Would you like to continue with that?`;
  }
  if (callCount > 1) {
    return `Welcome back, ${firstName}! Great to hear from you again. How can I help you today?`;
  }
  return `Welcome back, ${firstName}! How can I help you today?`;
}
