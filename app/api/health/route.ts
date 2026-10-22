import { NextResponse } from "next/server";
import pkg from "@/package.json";
import { getDb } from "@/lib/db";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb().prepare("SELECT COUNT(*) AS n FROM providers").get();
    return NextResponse.json({
      status: "ok",
      db: "ok",
      uptimeSec: Math.floor(process.uptime()),
      version: pkg.version,
    });
  } catch (err) {
    log("error", "health_failed", { route: "/api/health", error: err });
    return NextResponse.json(
      { status: "error", db: "down", uptimeSec: Math.floor(process.uptime()), version: pkg.version },
      { status: 503 }
    );
  }
}
