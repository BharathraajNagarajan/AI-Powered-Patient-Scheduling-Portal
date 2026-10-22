import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

if (fs.existsSync(path.resolve(".env.local"))) process.loadEnvFile(path.resolve(".env.local"));

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");
const file = path.join(dataDir, "portal.db");

if (!fs.existsSync(file)) {
  console.error(`No database at ${file}`);
  process.exit(1);
}

const db = new Database(file, { readonly: true });

function count(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

interface Check {
  name: string;
  violations: number;
}

const checks: Check[] = [
  {
    name: "no slot_id appears twice in bookings",
    violations: count(
      "SELECT COUNT(*) AS n FROM (SELECT slot_id FROM bookings GROUP BY slot_id HAVING COUNT(*) > 1)"
    ),
  },
  {
    name: "every booking's slot has status booked",
    violations: count(
      "SELECT COUNT(*) AS n FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE s.status <> 'booked'"
    ),
  },
  {
    name: "booked slot count equals booking count",
    violations: Math.abs(
      count("SELECT COUNT(*) AS n FROM slots WHERE status = 'booked'") - count("SELECT COUNT(*) AS n FROM bookings")
    ),
  },
  {
    name: "no session has more than one booking",
    violations: count(
      "SELECT COUNT(*) AS n FROM (SELECT session_id FROM bookings GROUP BY session_id HAVING COUNT(*) > 1)"
    ),
  },
  {
    name: "no booked slot is also an active reservation",
    violations: count(
      `SELECT COUNT(*) AS n FROM slots s
       WHERE s.status = 'booked'
         AND (s.reserved_until IS NOT NULL
              OR EXISTS (SELECT 1 FROM sessions x WHERE x.selected_slot_id = s.id AND x.booking_status = 'pending')
              OR NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id AND b.session_id = s.reserved_by_session))`
    ),
  },
  {
    name: "every confirmed session has exactly one booking",
    violations: count(
      `SELECT COUNT(*) AS n FROM sessions s
       WHERE s.booking_status = 'confirmed'
         AND (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id) <> 1`
    ),
  },
];

let failed = false;
for (const check of checks) {
  const ok = check.violations === 0;
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${check.name}${ok ? "" : ` (${check.violations} violations)`}`);
}

console.log(
  `\nsessions=${count("SELECT COUNT(*) AS n FROM sessions")} bookings=${count(
    "SELECT COUNT(*) AS n FROM bookings"
  )} slots=${count("SELECT COUNT(*) AS n FROM slots")} booked=${count(
    "SELECT COUNT(*) AS n FROM slots WHERE status = 'booked'"
  )}`
);
console.log(failed ? "Integrity: FAILED" : "Integrity: OK");
db.close();
process.exit(failed ? 1 : 0);
