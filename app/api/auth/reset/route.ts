import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../../lib/db";
import { resetPassword } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: string; password?: string };
    if (!body.token || !body.password) return NextResponse.json({ error: "Reset token and new password are required." }, { status: 400 });
    await resetPassword(body.token, body.password);
    return NextResponse.json({ reset: true });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : error instanceof Error ? error.message : "Unable to reset password." }, { status: error instanceof DatabaseConfigurationError ? 503 : 400 }); }
}