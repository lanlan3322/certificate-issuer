import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../../lib/db";
import { PasswordResetDeliveryError, requestPasswordReset } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string };
    if (!body.email) return NextResponse.json({ error: "Registered email is required." }, { status: 400 });
    const result = await requestPasswordReset(body.email);
    return NextResponse.json({ message: "If the email is registered, reset instructions have been created.", developmentToken: result.resetToken });
  } catch (error) {
    const message = error instanceof DatabaseConfigurationError
      ? error.message
      : error instanceof PasswordResetDeliveryError
        ? error.message
        : error instanceof Error && /relation .*password_reset_tokens.*does not exist/i.test(error.message)
          ? "Password reset storage is not initialized. Apply database/migrations/001_initial_schema.sql and 002_issuer_auth.sql."
          : "Unable to create reset request. Check DATABASE_URL, migrations, and password-reset email configuration.";
    return NextResponse.json({ error: message }, { status: error instanceof DatabaseConfigurationError ? 503 : 400 });
  }
}