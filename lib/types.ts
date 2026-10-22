export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  timestamp: string;
}

export type Intent =
  | "select_slot"
  | "confirm_booking"
  | "change_slot"
  | "ask_info"
  | "refill"
  | "other";

export interface ModelOutput {
  reply: string;
  intent: Intent;
  slot_index: number | null;
}

export interface SlotView {
  id: string;
  label: string;
}

export interface ProviderView {
  name: string;
  specialty: string;
  matchScore: number | null;
}

export interface BookingView {
  bookingId: string;
  provider: string;
  label: string;
}

export interface ReservationView {
  slotId: string;
  label: string;
  expiresAt: string;
}

export interface ChatUi {
  provider?: ProviderView;
  slots?: SlotView[];
  booking?: BookingView;
}

export interface PublicSession {
  sessionId: string;
  patientName: string;
  provider: ProviderView | null;
  reservation: ReservationView | null;
  booking: BookingView | null;
  messages: ChatMessage[];
  callsRemaining: number;
}

export interface ChatResponse {
  reply: string;
  ui: ChatUi;
  session: PublicSession;
}

export interface IntakeValues {
  patientName: string;
  dob: string;
  phone: string;
  email: string;
  chiefComplaint: string;
  smsOptIn: boolean;
}

export interface ApiErrorBody {
  error: string;
}
