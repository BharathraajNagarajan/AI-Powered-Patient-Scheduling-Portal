import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDb, getDb } from "@/lib/db";
import { createSession, setMatch } from "@/lib/sessions";

let dir: string | null = null;

export function useTempDb(): void {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-test-"));
  process.env.DATA_DIR = dir;
  process.env.MOCK_LLM = "true";
  getDb();
}

export function dropTempDb(): void {
  closeDb();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
}

export function newSession(providerId: string | null = "doc-001"): string {
  const id = createSession({
    patientName: "Test Patient",
    dob: "1990-01-01",
    phone: "+14155550123",
    email: "test@example.com",
    chiefComplaint: "knee pain",
    smsOptIn: false,
  });
  if (providerId) setMatch(id, providerId, null);
  return id;
}

export function firstFreeSlotId(providerId = "doc-001", offset = 0): string {
  const row = getDb()
    .prepare("SELECT id FROM slots WHERE provider_id = ? AND status = 'free' ORDER BY starts_at LIMIT 1 OFFSET ?")
    .get(providerId, offset) as { id: string };
  return row.id;
}
