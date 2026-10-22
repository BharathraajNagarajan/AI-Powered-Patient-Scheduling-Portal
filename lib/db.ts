import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { doctors } from "./doctors";
import { ensureSlots } from "./slot-seed";

let instance: Database.Database | null = null;
let instancePath: string | null = null;
let lastTopUp = 0;
const TOP_UP_INTERVAL_MS = 6 * 60 * 60 * 1000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  starts_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free','reserved','booked')),
  reserved_by_session TEXT,
  reserved_until INTEGER,
  UNIQUE (provider_id, starts_at)
);
CREATE INDEX IF NOT EXISTS idx_slots_provider_start ON slots (provider_id, starts_at);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  patient_name TEXT NOT NULL,
  dob TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  chief_complaint TEXT NOT NULL,
  sms_opt_in INTEGER NOT NULL DEFAULT 0,
  matched_provider_id TEXT REFERENCES providers(id),
  match_score REAL,
  selected_slot_id TEXT REFERENCES slots(id),
  booking_status TEXT NOT NULL DEFAULT 'pending' CHECK (booking_status IN ('pending','confirmed')),
  booking_id TEXT,
  transcript TEXT NOT NULL DEFAULT '[]',
  last_call_at INTEGER,
  call_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id),
  slot_id TEXT NOT NULL UNIQUE REFERENCES slots(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS call_memory (
  phone TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  call_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);
CREATE TABLE IF NOT EXISTS provider_embeddings (
  model TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  vector TEXT NOT NULL,
  PRIMARY KEY (model, text_hash)
);
`;

function dataDir(): string {
  return process.env.DATA_DIR ?? "./data";
}

function seedProviders(db: Database.Database): void {
  const insert = db.prepare("INSERT OR IGNORE INTO providers (id, name, specialty) VALUES (?, ?, ?)");
  db.transaction(() => {
    for (const d of doctors) insert.run(d.id, d.name, d.specialty);
  }).immediate();
}

export function getDb(): Database.Database {
  const dir = path.resolve(/*turbopackIgnore: true*/ dataDir());
  const file = path.join(dir, "portal.db");
  if (instance && instancePath === file) {
    if (Date.now() - lastTopUp > TOP_UP_INTERVAL_MS) {
      ensureSlots(instance);
      lastTopUp = Date.now();
    }
    return instance;
  }
  if (instance) closeDb();
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  seedProviders(db);
  ensureSlots(db);
  instance = db;
  instancePath = file;
  lastTopUp = Date.now();
  return db;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
    instancePath = null;
  }
}
