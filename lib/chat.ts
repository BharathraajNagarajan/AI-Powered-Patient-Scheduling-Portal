import { bookSession } from "./booking";
import { ERROR_MESSAGES } from "./errors";
import { generateModelOutput, isMockLlm } from "./llm";
import { log } from "./log";
import { matchProvider } from "./matching";
import { officeInfo } from "./office-info";
import { buildSystemPrompt } from "./prompt";
import { getDoctor } from "./doctors";
import { listOfferedSlots, RESERVATION_MS, reserveSlot } from "./slots";
import {
  appendMessages,
  getSession,
  providerView,
  reservationView,
  setMatch,
  toPublicSession,
  type Session,
} from "./sessions";
import type { ChatMessage, ChatResponse, ChatUi, ModelOutput, SlotView } from "./types";

const UI_SLOT_LIMIT = 12;

export function greetingFor(session: Pick<Session, "patientName" | "chiefComplaint">): string {
  const firstName = session.patientName.split(" ")[0];
  return `Hello ${firstName}! I'm Aria, your care coordinator at ${officeInfo.name}. I can see you're coming in about: "${session.chiefComplaint}". Let me find the right specialist for you.`;
}

export function confirmationText(booking: { providerName: string; label: string; bookingId: string }): string {
  return `Your appointment with ${booking.providerName} on ${booking.label} is confirmed. Your booking ID is ${booking.bookingId}. A confirmation email is on its way to you.`;
}

export function heldText(label: string, providerName: string): string {
  const minutes = Math.round(RESERVATION_MS / 60_000);
  return `I am holding ${label} with ${providerName} for you for ${minutes} minutes. Would you like me to confirm this booking?`;
}

export function buildUi(sessionId: string, now: number = Date.now()): ChatUi {
  const session = getSession(sessionId);
  if (!session) return {};
  const ui: ChatUi = {};
  const provider = providerView(session);
  if (provider) ui.provider = provider;
  if (session.bookingStatus === "confirmed") {
    const view = toPublicSession(session, now).booking;
    if (view) ui.booking = view;
  } else if (session.matchedProviderId) {
    ui.slots = listOfferedSlots(session.matchedProviderId, session.id, now, UI_SLOT_LIMIT);
  }
  return ui;
}

export interface Outcome {
  reply: string;
}

export function applyModelOutput(
  sessionId: string,
  output: ModelOutput,
  offered: SlotView[],
  now: number = Date.now()
): Outcome {
  const session = getSession(sessionId);
  if (!session) return { reply: ERROR_MESSAGES.sessionNotFound };
  const providerName = session.matchedProviderId ? getDoctor(session.matchedProviderId)?.name ?? "" : "";

  if (output.intent === "select_slot" || output.intent === "change_slot") {
    const index = output.slot_index;
    if (index === null) {
      return output.intent === "change_slot" ? { reply: output.reply } : { reply: ERROR_MESSAGES.unknownSlot };
    }
    if (!Number.isInteger(index) || index < 1 || index > offered.length) {
      return { reply: ERROR_MESSAGES.unknownSlot };
    }
    const result = reserveSlot(sessionId, offered[index - 1].id, now);
    if (!result.ok) {
      return { reply: result.reason === "unavailable" ? ERROR_MESSAGES.duplicateBooking : ERROR_MESSAGES.generalError };
    }
    return { reply: heldText(result.slot.label, providerName) };
  }

  if (output.intent === "confirm_booking") {
    const result = bookSession(sessionId, now);
    if (result.ok) {
      return {
        reply: result.booking.alreadyConfirmed
          ? `You are already booked with ${result.booking.providerName} on ${result.booking.label}. Your booking ID is ${result.booking.bookingId}.`
          : confirmationText(result.booking),
      };
    }
    if (result.reason === "expired") return { reply: ERROR_MESSAGES.reservationExpired };
    if (result.reason === "conflict") return { reply: ERROR_MESSAGES.duplicateBooking };
    if (result.reason === "not_found") return { reply: ERROR_MESSAGES.sessionNotFound };
    return { reply: ERROR_MESSAGES.pickTimeFirst };
  }

  return { reply: output.reply };
}

export type ChatResult =
  | { ok: true; response: ChatResponse }
  | { ok: false; status: number; error: string };

function stamp(role: ChatMessage["role"], content: string): ChatMessage {
  return { role, content, timestamp: new Date().toISOString() };
}

function respond(sessionId: string, reply: string): ChatResult {
  const session = getSession(sessionId);
  if (!session) return { ok: false, status: 404, error: ERROR_MESSAGES.sessionNotFound };
  return { ok: true, response: { reply, ui: buildUi(sessionId), session: toPublicSession(session) } };
}

export async function handleChat(
  sessionId: string,
  message: string | undefined,
  initial: boolean
): Promise<ChatResult> {
  const started = Date.now();
  let session = getSession(sessionId);
  if (!session) return { ok: false, status: 404, error: ERROR_MESSAGES.sessionNotFound };

  if (initial) {
    const existing = session.transcript.at(-1);
    if (session.transcript.length > 1 && existing) return respond(sessionId, existing.content);
    if (session.transcript.length === 0) appendMessages(sessionId, [stamp("assistant", greetingFor(session))]);
    session = getSession(sessionId) as Session;
  } else if (!message) {
    return { ok: false, status: 400, error: ERROR_MESSAGES.invalidInput };
  }

  const userText = initial ? `My chief complaint is: ${session.chiefComplaint}` : (message as string);
  const matchText = initial ? session.chiefComplaint : (message as string);
  let matchPath = "existing";

  if (!session.matchedProviderId && session.bookingStatus !== "confirmed") {
    const match = await matchProvider(matchText);
    matchPath = match.path;
    if (match.path === "unsupported") {
      const newMessages = initial ? [] : [stamp("user", userText)];
      appendMessages(sessionId, [...newMessages, stamp("assistant", ERROR_MESSAGES.noSpecialist)]);
      log("info", "chat_unsupported", { route: "/api/chat", sessionId, matchPath, latencyMs: Date.now() - started });
      return respond(sessionId, ERROR_MESSAGES.noSpecialist);
    }
    if (match.doctor) {
      setMatch(sessionId, match.doctor.id, match.score);
      session = getSession(sessionId) as Session;
    }
    log("info", "provider_match", { route: "/api/chat", sessionId, matchPath, matched: Boolean(match.doctor) });
  }

  const doctor = session.matchedProviderId ? getDoctor(session.matchedProviderId) : null;
  const offered =
    doctor && session.bookingStatus !== "confirmed" ? listOfferedSlots(doctor.id, sessionId) : [];
  const held = reservationView(session);

  let output: ModelOutput;
  try {
    output = await generateModelOutput({
      systemPrompt: buildSystemPrompt({
        patientName: session.patientName,
        chiefComplaint: session.chiefComplaint,
        providerName: doctor?.name ?? null,
        bookingStatus: session.bookingStatus,
        heldSlotLabel: held?.label ?? null,
        bookingId: session.bookingId,
        offered,
      }),
      history: session.transcript,
      userMessage: userText,
      offered,
      providerName: doctor?.name ?? null,
      specialty: doctor?.specialty ?? null,
      hasHeldSlot: Boolean(held),
      isInitial: initial,
    });
  } catch (err) {
    log("error", "llm_failed", { route: "/api/chat", sessionId, error: err, mock: isMockLlm() });
    return { ok: false, status: 502, error: ERROR_MESSAGES.apiTimeout };
  }

  const outcome = applyModelOutput(sessionId, output, offered);
  const newMessages = initial ? [] : [stamp("user", userText)];
  appendMessages(sessionId, [...newMessages, stamp("assistant", outcome.reply)]);
  log("info", "chat_complete", {
    route: "/api/chat",
    sessionId,
    intent: output.intent,
    matchPath,
    latencyMs: Date.now() - started,
  });
  return respond(sessionId, outcome.reply);
}

export function handleSelectSlot(sessionId: string, slotId: string): ChatResult {
  const session = getSession(sessionId);
  if (!session) return { ok: false, status: 404, error: ERROR_MESSAGES.sessionNotFound };
  const providerName = session.matchedProviderId ? getDoctor(session.matchedProviderId)?.name ?? "" : "";
  const result = reserveSlot(sessionId, slotId);
  if (!result.ok) {
    const status = result.reason === "unavailable" ? 409 : 400;
    const error = result.reason === "unavailable" ? ERROR_MESSAGES.duplicateBooking : ERROR_MESSAGES.generalError;
    return { ok: false, status, error };
  }
  const reply = heldText(result.slot.label, providerName);
  appendMessages(sessionId, [stamp("assistant", reply)]);
  return respond(sessionId, reply);
}
