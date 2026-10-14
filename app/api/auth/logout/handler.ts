import { NextResponse } from "next/server";
import { getCurrentIssuerUser, logoutIssuer } from "../../../../lib/auth";
import { AuditService } from "../../../../services/AuditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentIssuerUser();
  if (user) {
    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: user.issuerId,
      userId: user.id,
      action: "auth.logout",
      entityType: "user",
      entityId: user.id,
    });
  }
  await logoutIssuer();
  return NextResponse.json({ loggedOut: true });
}