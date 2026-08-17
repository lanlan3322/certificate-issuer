import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../../lib/db";
import { loginIssuer } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    if (!body.email || !body.password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    return NextResponse.json({ user: await loginIssuer(body.email, body.password) });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : "Invalid email or password." }, { status: error instanceof DatabaseConfigurationError ? 503 : 401 }); }
}