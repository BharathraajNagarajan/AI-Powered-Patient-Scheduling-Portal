import { NextRequest, NextResponse } from "next/server";
import { handleSelectSlot } from "@/lib/chat";
import { ERROR_MESSAGES } from "@/lib/errors";
import { parseBody } from "@/lib/http";
import { log } from "@/lib/log";
import { enforceRate, RATE_RULES } from "@/lib/rate-limit";
import { selectSlotSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const limited = enforceRate(req, "/api/slots/select", RATE_RULES.slotsSelect);
  if (limited) return limited;

  const parsed = await parseBody(req, selectSlotSchema);
  if ("response" in parsed) return parsed.response;
  const { sessionId, slotId } = parsed.data;

  try {
    const result = handleSelectSlot(sessionId, slotId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.response);
  } catch (err) {
    log("error", "select_slot_failed", { route: "/api/slots/select", sessionId, error: err });
    return NextResponse.json({ error: ERROR_MESSAGES.generalError }, { status: 500 });
  }
}
