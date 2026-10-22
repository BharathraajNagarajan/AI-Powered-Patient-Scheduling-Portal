import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { getDoctor } from "./doctors";
import { formatSlotLabel } from "./time";
import type {
  BookingView,
  ChatMessage,
  ProviderView,
  PublicSession,
  ReservationView,
} from "./types";

export type MatchStage = "clarifying" | "choosing";

export const MAX_CALLS_PER_SESSION = 3;
const MAX_STORED_MESSAGES = 100;

export interface Session {
  id: string;
  patientName: string;
  dob: string;
  phone: string;
  email: string;
  chiefComplaint: string;
  smsOptIn: boolean;
  matchedProviderId: string | null;
  matchScore: number | null;
  matchStage: MatchStage | null;
  matchCandidates: string[];
  selectedSlotId: string | null;
  bookingStatus: "pending" | "confirmed";
  bookingId: string | null;
  transcript: ChatMessage[];
  lastCallAt: number | null;
  callCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SessionRow {
  id: string;
  patient_name: string;
  dob: string;
  phone: string;
  email: string;
  chief_complaint: string;
  sms_opt_in: number;
  matched_provider_id: string | null;
  match_score: number | null;
  match_stage: MatchStage | null;
  match_candidates: string | null;
  selected_slot_id: string | null;
  booking_status: "pending" | "confirmed";
  booking_id: string | null;
  transcript: string;
  last_call_at: number | null;
  call_count: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: SessionRow): Session {
  return {
    id: row.id,
    patientName: row.patient_name,
    dob: row.dob,
    phone: row.phone,
    email: row.email,
    chiefComplaint: row.chief_complaint,
    smsOptIn: row.sms_opt_in === 1,
    matchedProviderId: row.matched_provider_id,
    matchScore: row.match_score,
    matchStage: row.match_stage,
    matchCandidates: row.match_candidates ? (JSON.parse(row.match_candidates) as string[]) : [],
    selectedSlotId: row.selected_slot_id,
    bookingStatus: row.booking_status,
    bookingId: row.booking_id,
    transcript: JSON.parse(row.transcript) as ChatMessage[],
    lastCallAt: row.last_call_at,
    callCount: row.call_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NewSession {
  patientName: string;
  dob: string;
  phone: string;
  email: string;
  chiefComplaint: string;
  smsOptIn: boolean;
}

export function createSession(input: NewSession): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO sessions (id, patient_name, dob, phone, email, chief_complaint, sms_opt_in, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.patientName, input.dob, input.phone, input.email, input.chiefComplaint, input.smsOptIn ? 1 : 0, now, now);
  return id;
}

export function getSession(id: string): Session | null {
  const row = getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  return row ? mapRow(row) : null;
}

export function setMatch(sessionId: string, providerId: string, score: number | null): void {
  getDb()
    .prepare(
      `UPDATE sessions SET matched_provider_id = ?, match_score = ?, match_stage = NULL, match_candidates = NULL,
       updated_at = ? WHERE id = ?`
    )
    .run(providerId, score, new Date().toISOString(), sessionId);
}

export function setMatchStage(sessionId: string, stage: MatchStage | null, candidates: string[]): void {
  getDb()
    .prepare("UPDATE sessions SET match_stage = ?, match_candidates = ?, updated_at = ? WHERE id = ?")
    .run(stage, stage ? JSON.stringify(candidates) : null, new Date().toISOString(), sessionId);
}

export function appendMessages(sessionId: string, messages: ChatMessage[]): void {
  const db = getDb();
  db.transaction(() => {
    const row = db.prepare("SELECT transcript FROM sessions WHERE id = ?").get(sessionId) as
      | { transcript: string }
      | undefined;
    if (!row) return;
    const next = [...(JSON.parse(row.transcript) as ChatMessage[]), ...messages].slice(-MAX_STORED_MESSAGES);
    db.prepare("UPDATE sessions SET transcript = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(next),
      new Date().toISOString(),
      sessionId
    );
  }).immediate();
}

export function providerView(session: Session): ProviderView | null {
  if (!session.matchedProviderId) return null;
  const doctor = getDoctor(session.matchedProviderId);
  if (!doctor) return null;
  return { name: doctor.name, specialty: doctor.specialty, matchScore: session.matchScore };
}

export function reservationView(session: Session, now: number = Date.now()): ReservationView | null {
  if (!session.selectedSlotId || session.bookingStatus === "confirmed") return null;
  const slot = getDb()
    .prepare("SELECT starts_at, status, reserved_by_session, reserved_until FROM slots WHERE id = ?")
    .get(session.selectedSlotId) as
    | { starts_at: string; status: string; reserved_by_session: string | null; reserved_until: number | null }
    | undefined;
  if (
    !slot ||
    slot.status !== "reserved" ||
    slot.reserved_by_session !== session.id ||
    slot.reserved_until === null ||
    slot.reserved_until < now
  ) {
    return null;
  }
  return {
    slotId: session.selectedSlotId,
    label: formatSlotLabel(slot.starts_at),
    expiresAt: new Date(slot.reserved_until).toISOString(),
  };
}

export function bookingView(session: Session): BookingView | null {
  if (session.bookingStatus !== "confirmed" || !session.bookingId || !session.selectedSlotId) return null;
  const slot = getDb().prepare("SELECT starts_at FROM slots WHERE id = ?").get(session.selectedSlotId) as
    | { starts_at: string }
    | undefined;
  const provider = providerView(session);
  if (!slot || !provider) return null;
  return { bookingId: session.bookingId, provider: provider.name, label: formatSlotLabel(slot.starts_at) };
}

export function toPublicSession(session: Session, now: number = Date.now()): PublicSession {
  return {
    sessionId: session.id,
    patientName: session.patientName,
    provider: providerView(session),
    reservation: reservationView(session, now),
    booking: bookingView(session),
    messages: session.transcript,
    callsRemaining: Math.max(0, MAX_CALLS_PER_SESSION - session.callCount),
  };
}
