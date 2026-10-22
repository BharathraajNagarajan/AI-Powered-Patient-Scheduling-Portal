import { NextRequest, NextResponse } from "next/server";
import { handleSelectProvider } from "@/lib/chat";
import { ERROR_MESSAGES } from "@/lib/errors";
import { parseBody } from "@/lib/http";
import { log } from "@/lib/log";
import { enforceRate, RATE_RULES } from "@/lib/rate-limit";
import { selectProviderSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const limited = enforceRate(req, "/api/provider/select", RATE_RULES.providerSelect);
  if (limited) return limited;

  const parsed = await parseBody(req, selectProviderSchema);
  if ("response" in parsed) return parsed.response;
  const { sessionId, providerId } = parsed.data;

  try {
    const result = handleSelectProvider(sessionId, providerId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.response);
  } catch (err) {
    log("error", "select_provider_failed", { route: "/api/provider/select", sessionId, error: err });
    return NextResponse.json({ error: ERROR_MESSAGES.generalError }, { status: 500 });
  }
}
