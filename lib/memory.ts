import { PatientSession } from './session';

// In-memory store keyed by phone number
// This powers the "returning caller" feature
const conversationMemory: Record<string, StoredConversation> = {};

export interface StoredConversation {
  phone: string;
  patientName: string;
  lastSession: PatientSession;
  lastUpdated: string;
  callCount: number;
}

export function saveConversation(phone: string, session: PatientSession): void {
  const normalized = normalizePhone(phone);
  const existing = conversationMemory[normalized];
  conversationMemory[normalized] = {
    phone: normalized,
    patientName: session.patientName,
    lastSession: session,
    lastUpdated: new Date().toISOString(),
    callCount: existing ? existing.callCount + 1 : 1
  };
  console.log(`[Memory] Saved conversation for ${normalized} — call count: ${conversationMemory[normalized].callCount}`);
}

export function getConversation(phone: string): StoredConversation | null {
  const normalized = normalizePhone(phone);
  const stored = conversationMemory[normalized];
  if (stored) {
    console.log(`[Memory] Found previous conversation for ${normalized}`);
    return stored;
  }
  console.log(`[Memory] No previous conversation found for ${normalized}`);
  return null;
}

export function buildRecallGreeting(stored: StoredConversation): string {
  const { patientName, lastSession, callCount } = stored;
  const firstName = patientName.split(' ')[0];

  if (lastSession.bookingStatus === 'confirmed' && lastSession.selectedSlotDatetime) {
    return `Welcome back, ${firstName}! I can see you have an appointment scheduled with ${lastSession.matchedDoctorName} on ${lastSession.selectedSlotDatetime}. Your booking ID is ${lastSession.bookingId}. How can I help you today?`;
  }

  if (lastSession.matchedDoctorName && lastSession.bookingStatus === 'pending') {
    return `Welcome back, ${firstName}! Last time we were working on scheduling an appointment with ${lastSession.matchedDoctorName} for your ${lastSession.chiefComplaint}. Would you like to continue with that?`;
  }

  if (callCount > 1) {
    return `Welcome back, ${firstName}! Great to hear from you again. How can I help you today?`;
  }

  return `Welcome back, ${firstName}! How can I help you today?`;
}

export function normalizePhone(phone: string): string {
  // Strip everything except digits
  return phone.replace(/\D/g, '');
}

export function hasConversation(phone: string): boolean {
  return !!conversationMemory[normalizePhone(phone)];
}