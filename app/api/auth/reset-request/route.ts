import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../../lib/db";
import { requestPasswordReset } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string };
    if (!body.email) return NextResponse.json({ error: "Registered email is required." }, { status: 400 });
    const result = await requestPasswordReset(body.email);
    return NextResponse.json({ message: "If the email is registered, reset instructions have been created.", developmentToken: result.resetToken });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : "Unable to create reset request." }, { status: error instanceof DatabaseConfigurationError ? 503 : 400 }); }
}