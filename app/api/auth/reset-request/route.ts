import { NextResponse } from "next/server";
import { enforceRateLimit, requestPasswordReset } from "../../../../lib/auth";
import { clientIp, errorResponse } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    if (!body.email) return NextResponse.json({ error: "Registered email is required." }, { status: 400 });

    await enforceRateLimit("reset:ip", clientIp(request), 5, 60);

    const configuredBaseUrl = process.env.PASSWORD_RESET_BASE_URL?.replace(/\/$/, "");
    const baseUrl = configuredBaseUrl ?? new URL(request.url).origin;
    const result = await requestPasswordReset(body.email, baseUrl);
    return NextResponse.json({
      message: "If the email is registered, reset instructions have been created.",
      developmentToken: result.resetToken,
    });
  } catch (error) {
    return errorResponse(error, "Unable to create reset request.");
  }
}
