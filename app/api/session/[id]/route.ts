import { NextRequest, NextResponse } from "next/server";
import { buildUi } from "@/lib/chat";
import { ERROR_MESSAGES } from "@/lib/errors";
import { getSession, toPublicSession } from "@/lib/sessions";
import { sessionIdSchema } from "@/lib/validation";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sessionIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: ERROR_MESSAGES.sessionNotFound }, { status: 404 });
  }
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: ERROR_MESSAGES.sessionNotFound }, { status: 404 });
  return NextResponse.json({ session: toPublicSession(session), ui: buildUi(id) });
}
