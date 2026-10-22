import { NextRequest, NextResponse } from "next/server";
import { placeCall } from "@/lib/call";
import { ERROR_MESSAGES } from "@/lib/errors";
import { parseBody } from "@/lib/http";
import { log } from "@/lib/log";
import { enforceRate, RATE_RULES } from "@/lib/rate-limit";
import { initiateCallSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const limited = enforceRate(req, "/api/initiate-call", RATE_RULES.initiateCall);
  if (limited) return limited;

  const parsed = await parseBody(req, initiateCallSchema);
  if ("response" in parsed) return parsed.response;
  const { sessionId } = parsed.data;

  try {
    const result = await placeCall(sessionId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, callId: result.callId, callsRemaining: result.callsRemaining });
  } catch (err) {
    log("error", "initiate_call_failed", { route: "/api/initiate-call", sessionId, error: err });
    return NextResponse.json({ error: ERROR_MESSAGES.callFailed }, { status: 500 });
  }
}
