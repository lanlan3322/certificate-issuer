import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";
import { OrganizationService, type OrganizationRecord } from "../../../services/OrganizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

export async function GET() {
  const { user, response } = await authorize();
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
  // Allow any authenticated user to create their first org; callers without a role
  // that can perform the write will hit RLS errors. For admin/tenant creation we
  // explicitly resolve via `authorize()` (no role gate).
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const body = (await request.json()) as { name?: string; slug?: string };

    const name = body.name?.trim();
    const slug = body.slug?.trim().toLowerCase();

    if (!name || !slug) {
      return NextResponse.json(
        { error: "name and slug are required." },
        { status: 400 }
      );
    }
    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json(
        { error: "Slug must be 2-63 lowercase letters, numbers, or hyphens (starting with a letter or number)." },
        { status: 400 }
      );
    }

    const organization = await OrganizationService.create({ name, slug }, user.id);

    await AuditService.record({
      organizationId: organization.id,
      userId: user.id,
      action: "organization.created",
      entityType: "organization",
      entityId: organization.id,
      metadata: { name, slug },
    });

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create organization.");
  }
}
