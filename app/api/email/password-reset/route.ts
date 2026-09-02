import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PasswordResetEmailRequest {
  email?: string;
  resetUrl?: string;
}

function hasValidWebhookAuthorization(request: Request) {
  const secret = process.env.PASSWORD_RESET_WEBHOOK_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  if (!hasValidWebhookAuthorization(request)) {
    return NextResponse.json({ error: "Unauthorized reset-email request." }, { status: 401 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM;
  if (!resendApiKey || !from) {
    return NextResponse.json(
      { error: "RESEND_API_KEY and PASSWORD_RESET_FROM must be configured." },
      { status: 503 }
    );
  }

  const body = (await request.json()) as PasswordResetEmailRequest;
  if (!body.email || !body.resetUrl) {
    return NextResponse.json({ error: "Email and reset URL are required." }, { status: 400 });
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [body.email],
      subject: "Reset your Verifiable password",
      text: `Use this link to reset your password:\n\n${body.resetUrl}\n\nThis link expires in 30 minutes.`,
    }),
  });

  if (!resendResponse.ok) {
    console.error("Resend password-reset delivery failed", {
      status: resendResponse.status,
      response: await resendResponse.text(),
    });
    return NextResponse.json({ error: "Unable to deliver password reset email." }, { status: 502 });
  }

  return NextResponse.json({ delivered: true });
}
