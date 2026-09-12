import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();

  try {
    await db.execute(sql`SELECT 1`);
    const dbLatency = Date.now() - startTime;

    return NextResponse.json(
      {
        status: "ok",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        database: {
          status: "connected",
          latencyMs: dbLatency,
        },
        version: process.env.npm_package_version || "0.1.0",
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database check failed";
    return NextResponse.json(
      {
        status: "degraded",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        database: {
          status: "disconnected",
          error: message,
        },
      },
      { status: 503 }
    );
  }
}
