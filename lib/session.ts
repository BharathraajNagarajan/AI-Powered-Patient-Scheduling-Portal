import { v4 as uuidv4 } from 'uuid';

export interface PatientSession {
  // Patient info
  patientName: string;
  dob: string;
  phone: string;
  email: string;
  chiefComplaint: string;
  smsOptIn: boolean;

  // Booking state
  matchedDoctorId: string | null;
  matchedDoctorName: string | null;
  matchedDoctorSpecialty: string | null;
  selectedSlotId: string | null;
  selectedSlotDatetime: string | null;
  slotStatus: 'free' | 'reserved' | 'booked';
  bookingStatus: 'pending' | 'confirmed';
  bookingId: string | null;

  // Conversation
  chatTranscript: ChatMessage[];
  voiceSummary: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export function createSession(patientInfo: {
  patientName: string;
  dob: string;
  phone: string;
  email: string;
  chiefComplaint: string;
  smsOptIn: boolean;
}): PatientSession {
  return {
    ...patientInfo,
    matchedDoctorId: null,
    matchedDoctorName: null,
    matchedDoctorSpecialty: null,
    selectedSlotId: null,
    selectedSlotDatetime: null,
    slotStatus: 'free',
    bookingStatus: 'pending',
    bookingId: null,
    chatTranscript: [],
    voiceSummary: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function generateBookingId(): string {
  return `BKG-${uuidv4().split('-')[0].toUpperCase()}`;
}

export function generateVoiceSummary(session: PatientSession): string {
  const parts = [];
  parts.push(`Patient: ${session.patientName}`);
  parts.push(`Complaint: ${session.chiefComplaint}`);

  if (session.matchedDoctorName) {
    parts.push(`Matched: ${session.matchedDoctorName} (${session.matchedDoctorSpecialty})`);
  }

  if (session.selectedSlotDatetime && session.bookingStatus === 'confirmed') {
    parts.push(`Appointment: ${session.selectedSlotDatetime} — Confirmed`);
    parts.push(`Booking ID: ${session.bookingId}`);
  } else if (session.selectedSlotDatetime) {
    parts.push(`Slot selected: ${session.selectedSlotDatetime} — Pending confirmation`);
  }

  return parts.join('. ');
}

export function addMessageToTranscript(
  session: PatientSession,
  role: 'user' | 'assistant',
  content: string
): PatientSession {
  return {
    ...session,
    chatTranscript: [
      ...session.chatTranscript,
      { role, content, timestamp: new Date().toISOString() }
    ],
    updatedAt: new Date().toISOString()
  };
}

// localStorage helpers — keeps state alive on page refresh
export function saveSessionToStorage(session: PatientSession): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('kyron_session', JSON.stringify(session));
  }
}

export function loadSessionFromStorage(): PatientSession | null {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('kyron_session');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('kyron_session');
  }
}