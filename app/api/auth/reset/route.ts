import { NextResponse } from "next/server";
import { resetPassword } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Completes a recovery flow. The emailed link establishes a recovery session
 * via Supabase before this route is called, so no token is accepted here.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    if (!body.password) return NextResponse.json({ error: "A new password is required." }, { status: 400 });
    await resetPassword(body.password);
    return NextResponse.json({ reset: true });
  } catch (error) {
    return errorResponse(error, "Unable to reset password.");
  }
}
