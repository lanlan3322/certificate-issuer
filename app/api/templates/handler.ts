import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";
import { TemplateService } from "../../../services/TemplateService";
import { canAccessIssuer, isPlatformAdmin } from "../../../lib/permissions";
import { IssuerService } from "../../../services/IssuerService";
import { requireIssuerAccess } from "../../../lib/issuer-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    if (new URL(request.url).searchParams.get("purpose") === "issuance") {
      return NextResponse.json({
        templates: (await TemplateService.listForIssuance({
          organizationId: user.organizationId,
          platformAdmin: isPlatformAdmin(user),
        })).filter((template) => template.issuerId && canAccessIssuer(user, {
          id: template.issuerId, organizationId: template.organizationId,
        }, "issue")),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    // Scoped to the session's issuer; the issuerId query param is ignored.
    return NextResponse.json({ templates: await TemplateService.list(user.issuerId, {
      includeInactive, organizationId: user.organizationId, platformAdmin: isPlatformAdmin(user),
    }) });
  } catch (error) {
    return errorResponse(error, "Unable to load templates.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize("templates.manage");
  if (response) return response;
  try {
    const body = (await request.json()) as {
      slug?: string;
      name?: string;
      description?: string;
      definition?: Record<string, unknown>;
      issuerProfileId?: string | null;
      issuerId?: string;
    };

    const slug = body.slug?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!slug || !name) {
      return NextResponse.json({ error: "slug and name are required." }, { status: 400 });
    }
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
      return NextResponse.json({ error: "Slug must be 2-63 lowercase letters, numbers, or hyphens." }, { status: 400 });
    }
    if (body.issuerProfileId !== undefined &&
        body.issuerProfileId !== null &&
        (typeof body.issuerProfileId !== "string" || !body.issuerProfileId.trim())) {
      return NextResponse.json({ error: "issuerProfileId must be a non-empty string or null." }, { status: 400 });
    }

    const targetIssuerId = body.issuerId?.trim() || user.issuerId;
    if (!targetIssuerId) return NextResponse.json({ error: "Select an issuer for the template." }, { status: 400 });
    const owner = await IssuerService.getById(targetIssuerId);
    if (!owner || !canAccessIssuer(user, owner, "templates")) {
      return NextResponse.json({ error: "Issuer not found in your organization." }, { status: 403 });
    }
    if (!owner.active) return NextResponse.json({ error: "Select an active issuer." }, { status: 409 });
    const template = await TemplateService.upsert({
      issuerId: targetIssuerId,
      slug,
      name,
      description: body.description?.trim(),
      definition: body.definition,
      issuerProfileId: body.issuerProfileId?.trim() || body.issuerProfileId,
    });

    await AuditService.record({
      organizationId: owner.organizationId,
      issuerId: owner.id,
      userId: user.id,
      action: "template.saved",
      entityType: "template",
      entityId: template.id,
      metadata: { slug, name, issuerProfileId: template.issuerProfileId },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to save template.");
  }
}

export async function DELETE(request: Request) {
  const { user, response } = await authorize("templates.manage");
  if (response) return response;
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    const templates = await TemplateService.list(user.issuerId, {
      includeInactive: true, organizationId: user.organizationId, platformAdmin: isPlatformAdmin(user),
    });
    const existing = templates.find((template) => template.id === id);
    if (!existing?.issuerId) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    await requireIssuerAccess(user, existing.issuerId, "templates");
    const template = await TemplateService.deactivate(id, existing.issuerId);
    await AuditService.record({
      organizationId: template.organizationId,
      issuerId: existing.issuerId,
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
