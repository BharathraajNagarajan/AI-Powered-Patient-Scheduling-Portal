import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { ERROR_MESSAGES } from "./errors";
import { fieldErrors } from "./validation";

export function jsonError(error: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<{ data: T } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: jsonError(ERROR_MESSAGES.invalidInput, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { response: jsonError(ERROR_MESSAGES.invalidInput, 400, { fields: fieldErrors(parsed.error) }) };
  }
  return { data: parsed.data };
}
