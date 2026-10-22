type Level = "info" | "warn" | "error";

export interface LogFields {
  route?: string;
  sessionId?: string;
  latencyMs?: number;
  matchPath?: string;
  [key: string]: unknown;
}

const REDACTED_KEYS = new Set(["transcript", "messages", "content", "reply", "message", "history"]);

export function maskEmail(value: string): string {
  const [user, domain] = value.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length < 4 ? "***" : `***${digits.slice(-4)}`;
}

export function maskDob(): string {
  return "****-**-**";
}

function sanitize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    const lower = key.toLowerCase();
    if (REDACTED_KEYS.has(lower)) continue;
    if (typeof value === "string") {
      if (lower.includes("email")) out[key] = maskEmail(value);
      else if (lower.includes("phone")) out[key] = maskPhone(value);
      else if (lower === "dob") out[key] = maskDob();
      else out[key] = value;
    } else if (value instanceof Error) {
      out[key] = value.message;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function log(level: Level, msg: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...sanitize(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
