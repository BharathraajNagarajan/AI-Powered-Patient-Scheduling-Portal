import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/http";
import { log } from "@/lib/log";
import { buildRecallGreeting, getConversation } from "@/lib/memory";
import { bookingView, providerView } from "@/lib/sessions";
import { recallSchema } from "@/lib/validation";

function authorized(req: NextRequest): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  const provided = req.headers.get("x-vapi-secret");
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ found: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(req, recallSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const stored = getConversation(parsed.data.phone);
    if (!stored) return NextResponse.json({ found: false });
    const { session } = stored;
    log("info", "recall_hit", { route: "/api/recall", sessionId: session.id });
    return NextResponse.json({
      found: true,
      patientName: stored.patientName,
      greeting: buildRecallGreeting(stored),
      callCount: stored.callCount,
      lastUpdated: stored.lastUpdated,
      summary: {
        chiefComplaint: session.chiefComplaint,
        provider: providerView(session)?.name ?? null,
        bookingStatus: session.bookingStatus,
        booking: bookingView(session),
      },
    });
  } catch (err) {
    log("error", "recall_failed", { route: "/api/recall", error: err });
    return NextResponse.json({ found: false, error: "Recall failed" }, { status: 500 });
  }
}
