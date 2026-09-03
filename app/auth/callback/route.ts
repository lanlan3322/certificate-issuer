import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redacted(value: string | null) {
  if (!value) return null;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function authCallbackLog(message: string, details?: Record<string, unknown>) {
  console.info(`[auth-callback] ${message}`, details ?? {});
}

/**
 * Establishes a Supabase password-recovery session from an email token hash.
 * Do not exchange PKCE auth codes here; password recovery links must not depend
 * on browser-local code verifier storage.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const mode = url.searchParams.get("mode") ?? "reset";

  authCallbackLog("arrival", {
    origin: url.origin,
    pathname: url.pathname,
    mode,
    type,
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    code: redacted(code),
    tokenHash: redacted(tokenHash),
  });

  if (code) {
    authCallbackLog("pkce auth code rejected for password recovery", {
      mode,
      type,
      reason: "Password reset must use token_hash/token and verifyOtp, not exchangeCodeForSession.",
    });
    return NextResponse.redirect(new URL("/issuer/?error=pkce_recovery_link", url.origin));
  }

  if (!tokenHash) {
    authCallbackLog("missing recovery token hash", { mode, type });
    return NextResponse.redirect(new URL("/issuer/?error=missing_code", url.origin));
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type ?? "recovery" });

  authCallbackLog("verifyOtp response", {
    type: type ?? null,
    hasSession: Boolean(data.session),
    userId: data.user?.id ?? null,
    errorName: error?.name ?? null,
    errorMessage: error?.message ?? null,
    errorStatus: "status" in (error ?? {}) ? error?.status : null,
  });

  if (error) {
    return NextResponse.redirect(new URL("/issuer/?error=invalid_link", url.origin));
  }

  return NextResponse.redirect(new URL(`/issuer/?mode=${encodeURIComponent(mode)}`, url.origin));
}
