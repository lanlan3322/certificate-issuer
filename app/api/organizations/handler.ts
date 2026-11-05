import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { OrganizationService } from "../../../services/OrganizationService";
import { parseOrganizationInput } from "../../../lib/organization-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await authorize("organizations.manage");
  if (response) return response;
  try {
    // Return all organizations (including disabled) so the admin page can manage them.
    const orgs = await OrganizationService.list(true);
    return NextResponse.json({ organizations: orgs });
  } catch (error) {
    return errorResponse(error, "Unable to load organizations.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize("organizations.manage");
  if (response) return response;
  try {
    const input = parseOrganizationInput(await request.json());
    if (!input.name || !input.slug) return NextResponse.json({ error: "name and slug are required." }, { status: 400 });
    const organization = await OrganizationService.create({ ...input, name: input.name, slug: input.slug }, user.id);

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create organization.");
  }
}
