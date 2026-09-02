import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "../../../../lib/supabase/server";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }
  try {
    const { error } = await getSupabaseAdmin().from("organizations").select("id", { head: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, database: "supabase" });
  } catch {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 503 });
  }
}