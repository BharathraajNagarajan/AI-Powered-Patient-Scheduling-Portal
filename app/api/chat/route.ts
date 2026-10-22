import { NextRequest, NextResponse } from "next/server";
import { handleChat } from "@/lib/chat";
import { ERROR_MESSAGES } from "@/lib/errors";
import { parseBody } from "@/lib/http";
import { log } from "@/lib/log";
import { enforceRate, RATE_RULES } from "@/lib/rate-limit";
import { chatSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const limited = enforceRate(req, "/api/chat", RATE_RULES.chat);
  if (limited) return limited;

  const parsed = await parseBody(req, chatSchema);
  if ("response" in parsed) return parsed.response;
  const { sessionId, message, initial } = parsed.data;

  if (!initial && !message) {
    return NextResponse.json({ error: ERROR_MESSAGES.invalidInput }, { status: 400 });
  }

  try {
    const result = await handleChat(sessionId, message, Boolean(initial));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.response);
  } catch (err) {
    log("error", "chat_failed", { route: "/api/chat", sessionId, error: err });
    return NextResponse.json({ error: ERROR_MESSAGES.generalError }, { status: 500 });
  }
}
