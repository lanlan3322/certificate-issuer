import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const params = new URL(request.url).searchParams;
    const days = Math.min(Math.max(Number(params.get("days") ?? 30), 1), 365);

    // Both queries are scoped to the caller's organization.
    const [summary, events] = await Promise.all([
      AuditService.summary(user.organizationId, days),
      AuditService.list(user.organizationId, {
        limit: Number(params.get("limit") ?? 100),
        entityType: params.get("entityType") ?? undefined,
      }),
    ]);

    return NextResponse.json({ summary, events });
  } catch (error) {
    return errorResponse(error, "Unable to load audit data.", 500);
  }
}
