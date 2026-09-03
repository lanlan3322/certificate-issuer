import { NextResponse } from "next/server";
import { enforceRateLimit, requestPasswordReset } from "../../../../lib/auth";
import { clientIp, errorResponse } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProductionRuntime() {
  return process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    if (!body.email) return NextResponse.json({ error: "Registered email is required." }, { status: 400 });

    const ip = clientIp(request);
    const resetLimit = isProductionRuntime() ? 50 : 50;
    console.info("[auth] reset password rate-limit request", {
      ip,
      limit: resetLimit,
      windowMinutes: 60,
      runtime: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      },
    });
    await enforceRateLimit("reset:ip", ip, resetLimit, 60);

    const requestOrigin = new URL(request.url).origin;
    const configuredBaseUrl = isProductionRuntime() ? undefined : process.env.PASSWORD_RESET_BASE_URL?.replace(/\/$/, "");
    const baseUrl = configuredBaseUrl ?? requestOrigin;
    console.info("[auth] reset password redirect configuration", {
      requestOrigin,
      configuredBaseUrl: configuredBaseUrl ?? null,
      baseUrl,
    });
    await requestPasswordReset(body.email, baseUrl);
    return NextResponse.json({
      message: "If the email is registered, reset instructions have been created.",
    });
  } catch (error) {
    console.error("[auth] reset password request failed", {
      errorName: error instanceof Error ? error.name : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      passwordResetBaseUrl: process.env.PASSWORD_RESET_BASE_URL ?? null,
    });
    return errorResponse(error, "Unable to create reset request.");
  }
}
