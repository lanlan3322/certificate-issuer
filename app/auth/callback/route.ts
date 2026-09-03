import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

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
 * Handles OAuth/auth-code callbacks only. Password recovery uses /auth/recovery
 * so reset links never depend on PKCE verifier storage here.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
  const next = url.searchParams.get("next") ?? "/issuer/";

  authCallbackLog("arrival", {
    origin: url.origin,
    pathname: url.pathname,
    next,
    hasCode: Boolean(code),
    code: redacted(code),
    hasFlowId: Boolean(flowId),
    flowId: redacted(flowId),
  });

  if (!code) {
    authCallbackLog("missing auth code", { next });
    return NextResponse.redirect(new URL("/issuer/?error=missing_code", url.origin));
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);

  authCallbackLog("exchangeCodeForSession response", {
    hasSession: Boolean(data.session),
    userId: data.user?.id ?? null,
    errorName: error?.name ?? null,
    errorMessage: error?.message ?? null,
    errorStatus: "status" in (error ?? {}) ? error?.status : null,
  });

  if (error) {
    return NextResponse.redirect(new URL("/issuer/?error=invalid_link", url.origin));
  }

  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/issuer/", url.origin));
}
