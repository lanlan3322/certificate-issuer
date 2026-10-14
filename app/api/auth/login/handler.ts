import { NextResponse } from "next/server";
import { enforceRateLimit, loginIssuer } from "../../../../lib/auth";
import { clientIp, errorResponse } from "../../../../lib/apiAuth";
import { AuditService } from "../../../../services/AuditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    await enforceRateLimit("login:ip", clientIp(request), 10, 15);
    await enforceRateLimit("login:email", body.email.trim().toLowerCase(), 5, 15);

    const user = await loginIssuer(body.email, body.password);
    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: user.issuerId,
      userId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      metadata: { ip: clientIp(request) },
    });
    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error, "Invalid email or password.", 401);
  }
}
