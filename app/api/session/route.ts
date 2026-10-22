import { NextRequest, NextResponse } from "next/server";
import { appendMessages, createSession, getSession, toPublicSession } from "@/lib/sessions";
import { greetingFor } from "@/lib/chat";
import { ERROR_MESSAGES } from "@/lib/errors";
import { parseBody } from "@/lib/http";
import { log } from "@/lib/log";
import { enforceRate, RATE_RULES } from "@/lib/rate-limit";
import { intakeSchema, normalizePhone } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const limited = enforceRate(req, "/api/session", RATE_RULES.session);
  if (limited) return limited;

  const parsed = await parseBody(req, intakeSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const input = { ...parsed.data, phone: normalizePhone(parsed.data.phone) };
    const sessionId = createSession(input);
    appendMessages(sessionId, [
      { role: "assistant", content: greetingFor(input), timestamp: new Date().toISOString() },
    ]);
    const session = getSession(sessionId)!;
    log("info", "session_created", { route: "/api/session", sessionId });
    return NextResponse.json({ sessionId, session: toPublicSession(session) }, { status: 201 });
  } catch (err) {
    log("error", "session_create_failed", { route: "/api/session", error: err });
    return NextResponse.json({ error: ERROR_MESSAGES.generalError }, { status: 500 });
  }
}
