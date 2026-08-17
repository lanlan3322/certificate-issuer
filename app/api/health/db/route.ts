import { NextResponse } from "next/server";
import { isDatabaseConfigured, query } from "../../../../lib/db";

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured." }, { status: 503 });
  try {
    await query("SELECT 1");
    return NextResponse.json({ ok: true, database: "postgresql" });
  } catch {
    return NextResponse.json({ ok: false, error: "Database unavailable." }, { status: 503 });
  }
}