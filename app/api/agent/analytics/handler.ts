import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../../lib/apiAuth";
import { AuditService } from "../../../../services/AuditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const body = (await request.json()) as { action?: string; metadata?: Record<string, unknown> };

    // Ownership is taken from the session, not the request body.
    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: user.issuerId,
      userId: user.id,
      action: String(body.action ?? "agent.action"),
      entityType: "agent",
      metadata: body.metadata,
    });

    return NextResponse.json({ tracked: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to record analytics.");
  }
}

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") ?? 30), 1), 365);
    return NextResponse.json({ summary: await AuditService.summary(user.organizationId, days) });
  } catch (error) {
    return errorResponse(error, "Unable to load analytics.", 500);
  }
}
