import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const { error } = await getSupabaseAdmin()
    .from("issuers")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("Supabase health check failed", error);
    return NextResponse.json(
      { ok: false, error: "Supabase unavailable." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, database: "supabase" });
}
