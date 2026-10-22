import { NextRequest, NextResponse } from "next/server";
import { bookSession } from "@/lib/booking";
import { buildUi, confirmationText } from "@/lib/chat";
import { ERROR_MESSAGES } from "@/lib/errors";
import { parseBody } from "@/lib/http";
import { log } from "@/lib/log";
import { enforceRate, RATE_RULES } from "@/lib/rate-limit";
import { appendMessages, getSession, toPublicSession } from "@/lib/sessions";
import { bookSchema } from "@/lib/validation";
import type { ChatResponse } from "@/lib/types";

const FAILURES = {
  not_found: { status: 404, error: ERROR_MESSAGES.sessionNotFound },
  no_reservation: { status: 400, error: ERROR_MESSAGES.pickTimeFirst },
  expired: { status: 409, error: ERROR_MESSAGES.reservationExpired },
  conflict: { status: 409, error: ERROR_MESSAGES.duplicateBooking },
} as const;

export async function POST(req: NextRequest) {
  const limited = enforceRate(req, "/api/book", RATE_RULES.book);
  if (limited) return limited;

  const parsed = await parseBody(req, bookSchema);
  if ("response" in parsed) return parsed.response;
  const { sessionId } = parsed.data;
  const started = Date.now();

  try {
    const result = bookSession(sessionId);
    if (!result.ok) {
      const failure = FAILURES[result.reason];
      log("info", "book_rejected", { route: "/api/book", sessionId, reason: result.reason });
      return NextResponse.json({ error: failure.error }, { status: failure.status });
    }

    const reply = confirmationText(result.booking);
    if (!result.booking.alreadyConfirmed) {
      appendMessages(sessionId, [{ role: "assistant", content: reply, timestamp: new Date().toISOString() }]);
    }
    const session = getSession(sessionId)!;
    const body: ChatResponse = { reply, ui: buildUi(sessionId), session: toPublicSession(session) };
    log("info", "book_complete", { route: "/api/book", sessionId, latencyMs: Date.now() - started });
    return NextResponse.json(body);
  } catch (err) {
    log("error", "book_failed", { route: "/api/book", sessionId, error: err });
    return NextResponse.json({ error: ERROR_MESSAGES.generalError }, { status: 500 });
  }
}
