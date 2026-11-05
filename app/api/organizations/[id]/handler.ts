import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../../lib/apiAuth";
import { canAccessOrganization } from "../../../../lib/permissions";
import { organizationIdFromRequest, parseOrganizationInput } from "../../../../lib/organization-input";
import { OrganizationService } from "../../../../services/OrganizationService";

export async function GET(request: Request) {
  const { user, response } = await authorize("organizations.read");
  if (response) return response;
  try {
    const id = organizationIdFromRequest(request);
    if (!canAccessOrganization(user, id)) return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
    const organization = await OrganizationService.getById(id);
    if (!organization || organization.softDeletedAt) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    return NextResponse.json({ organization });
  } catch (error) {
    return errorResponse(error, "Unable to load organization.", 400);
  }
}

export async function PATCH(request: Request) {
  const { response } = await authorize("organizations.manage");
  if (response) return response;
  try {
    const id = organizationIdFromRequest(request);
    const input = parseOrganizationInput(await request.json(), true);
    return NextResponse.json({ organization: await OrganizationService.update(id, input) });
  } catch (error) {
    return errorResponse(error, "Unable to update organization.", 400);
  }
}

export async function DELETE(request: Request) {
  const { response } = await authorize("organizations.manage");
  if (response) return response;
  try {
    const id = organizationIdFromRequest(request);
    const organization = await OrganizationService.update(id, { status: "disabled", softDeletedAt: new Date().toISOString() });
    return NextResponse.json({ organization });
  } catch (error) {
    return errorResponse(error, "Unable to delete organization.", 400);
  }
}
