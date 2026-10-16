import { NextRequest, NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../../lib/apiAuth";
import { AuditService } from "../../../../services/AuditService";
import { OrganizationService } from "../../../../services/OrganizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/");
  const id = pathSegments[pathSegments.length - 1];

  if (!id) {
    return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
  }

  const organization = await OrganizationService.getById(id);

  if (!organization) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  return NextResponse.json({ organization });
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await authorize();
  if (response) return response;

  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/");
    const id = pathSegments[pathSegments.length - 1];

    if (!id) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }

    const body = (await request.json()) as { status?: "active" | "disabled" };

    if (!body.status) {
      return NextResponse.json({ error: "status is required and must be 'active' or 'disabled'." }, { status: 400 });
    }

    const organization = await OrganizationService.updateStatus(id, body.status);

    await AuditService.record({
      organizationId: organization.id,
      userId: user.id,
      action: "organization.updated",
      entityType: "organization",
      entityId: organization.id,
      metadata: { status: body.status },
    });

    return NextResponse.json({ organization });
  } catch (error) {
    return errorResponse(error, "Unable to update organization.", 500);
  }
}