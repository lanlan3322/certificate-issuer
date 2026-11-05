import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../../../lib/apiAuth";
import { canAccessOrganization } from "../../../../../lib/permissions";
import { organizationIdFromRequest } from "../../../../../lib/organization-input";
import { OrganizationMemberService, type MembershipRole } from "../../../../../services/OrganizationMemberService";

async function access(request: Request, write: boolean) {
  const result = await authorize(write ? "members.manage" : "organizations.read");
  if (result.response) return result;
  const organizationId = organizationIdFromRequest(request);
  if (!canAccessOrganization(result.user, organizationId)) {
    return { response: NextResponse.json({ error: "Organization access denied." }, { status: 403 }) };
  }
  return { ...result, organizationId };
}

export async function GET(request: Request) {
  try {
    const result = await access(request, false);
    if (result.response) return result.response;
    return NextResponse.json({ members: await OrganizationMemberService.list(result.organizationId) });
  } catch (error) { return errorResponse(error, "Unable to load organization members."); }
}

async function mutate(request: Request, method: "POST" | "PATCH" | "DELETE") {
  try {
    const result = await access(request, true);
    if (result.response) return result.response;
    const body = await request.json() as { userId?: unknown; role?: unknown };
    if (typeof body.userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId)) {
      return NextResponse.json({ error: "A valid application userId is required." }, { status: 400 });
    }
    if (method === "DELETE") {
      await OrganizationMemberService.remove(result.organizationId, body.userId);
      return NextResponse.json({ removed: true });
    }
    if (typeof body.role !== "string" || !["organization_admin", "issuer", "viewer"].includes(body.role)) {
      return NextResponse.json({ error: "role must be organization_admin, issuer, or viewer." }, { status: 400 });
    }
    const role = body.role as MembershipRole;
    const member = method === "POST"
      ? await OrganizationMemberService.add(result.organizationId, body.userId, role)
      : await OrganizationMemberService.update(result.organizationId, body.userId, role);
    return NextResponse.json({ member }, { status: method === "POST" ? 201 : 200 });
  } catch (error) { return errorResponse(error, "Unable to update organization membership."); }
}
export const POST = (request: Request) => mutate(request, "POST");
export const PATCH = (request: Request) => mutate(request, "PATCH");
export const DELETE = (request: Request) => mutate(request, "DELETE");
