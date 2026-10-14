import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";
import { TemplateService } from "../../../services/TemplateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    // Scoped to the session's issuer; the issuerId query param is ignored.
    return NextResponse.json({ templates: await TemplateService.list(user.issuerId, { includeInactive }) });
  } catch (error) {
    return errorResponse(error, "Unable to load templates.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const body = (await request.json()) as {
      slug?: string;
      name?: string;
      description?: string;
      definition?: Record<string, unknown>;
    };

    const slug = body.slug?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!slug || !name) {
      return NextResponse.json({ error: "slug and name are required." }, { status: 400 });
    }
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
      return NextResponse.json({ error: "Slug must be 2-63 lowercase letters, numbers, or hyphens." }, { status: 400 });
    }

    const template = await TemplateService.upsert({
      issuerId: user.issuerId,
      slug,
      name,
      description: body.description?.trim(),
      definition: body.definition,
    });

    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: user.issuerId,
      userId: user.id,
      action: "template.saved",
      entityType: "template",
      entityId: template.id,
      metadata: { slug, name },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to save template.");
  }
}

export async function DELETE(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    const template = await TemplateService.deactivate(id, user.issuerId);
    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: user.issuerId,
      userId: user.id,
      action: "template.deactivated",
      entityType: "template",
      entityId: template.id,
    });
    return NextResponse.json({ template });
  } catch (error) {
    return errorResponse(error, "Unable to delete template.");
  }
}
