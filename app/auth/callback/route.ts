import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchanges the one-time code from a Supabase email link (recovery or
 * confirmation) for a session cookie, then hands off to the app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const mode = url.searchParams.get("mode") ?? "reset";

  if (!code) {
    return NextResponse.redirect(new URL("/issuer/?error=missing_code", url.origin));
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/issuer/?error=invalid_link", url.origin));
  }

  return NextResponse.redirect(new URL(`/issuer/?mode=${encodeURIComponent(mode)}`, url.origin));
}
