import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import type { AuthResponse, EmailOtpType } from "@supabase/supabase-js";

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
 * Establishes a Supabase session from email links. Supabase may return either
 * an auth code or an email OTP token hash depending on the configured template.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
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
    hasFlowId: Boolean(flowId),
    code: redacted(code),
    tokenHash: redacted(tokenHash),
    flowId: redacted(flowId),
  });

  if (!code && !tokenHash) {
    authCallbackLog("missing code or token hash", { mode, type });
    return NextResponse.redirect(new URL("/issuer/?error=missing_code", url.origin));
  }

  const supabase = await getSupabaseServerClient();
  let authResult: AuthResponse;
  if (tokenHash) {
    authResult = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type ?? "recovery" });
  } else {
    if (!code) {
      authCallbackLog("missing auth code in exchange branch", { mode, type });
      return NextResponse.redirect(new URL("/issuer/?error=missing_code", url.origin));
    }
    authResult = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  }
  const { data, error } = authResult;

  authCallbackLog(tokenHash ? "verifyOtp response" : "exchangeCodeForSession response", {
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
