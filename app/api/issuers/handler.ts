import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";
import { IssuerService, type IssuerRecord } from "../../../services/IssuerService";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: IssuerRecord["status"][] = ["active", "disabled", "suspended"];

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organization_id");
    const isPlatformAdmin = user.roles.includes("platform-admin");
    if (organizationId && organizationId !== "all") {
      if (organizationId !== user.organizationId && !isPlatformAdmin) {
        return NextResponse.json({ error: "Requires access to the requested organization." }, { status: 403 });
      }
      return NextResponse.json({ issuers: await IssuerService.list(organizationId) });
    }
    if (!isPlatformAdmin) {
      return NextResponse.json({ issuers: await IssuerService.list(user.organizationId) });
    }
    const { data, error } = await (await getSupabaseServerClient())
      .from("issuers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({
      issuers: (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        organizationId: String(row.organization_id),
        name: String(row.name),
        slug: String(row.slug),
        contactEmail: String(row.contact_email),
        didUri: row.did_uri ? String(row.did_uri) : undefined,
        status: row.status as IssuerRecord["status"],
        createdAt: String(row.created_at),
      })),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load issuers.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const isPlatformAdmin = user.roles.includes("platform-admin");
    if (!isPlatformAdmin && !user.roles.includes("issuer-admin")) {
      return NextResponse.json({ error: "Requires the issuer-admin role." }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      contactEmail?: string;
      didUri?: string;
      organizationId?: string;
    };

    const name = body.name?.trim();
    const slug = body.slug?.trim().toLowerCase();
    const contactEmail = body.contactEmail?.trim();

    if (!name || !slug || !contactEmail) {
      return NextResponse.json({ error: "name, slug, and contactEmail are required." }, { status: 400 });
    }
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
      return NextResponse.json({ error: "Slug must be 2-63 lowercase letters, numbers, or hyphens." }, { status: 400 });
    }

    const requestedOrgId = body.organizationId?.trim();
    if (requestedOrgId && requestedOrgId !== user.organizationId && !isPlatformAdmin) {
      return NextResponse.json({ error: "Requires the platform-admin role to create issuers in another organization." }, { status: 403 });
    }
    const targetOrgId = requestedOrgId || user.organizationId;

    const issuer = await IssuerService.create({
      organizationId: targetOrgId,
      name,
      slug,
      contactEmail,
      didUri: body.didUri?.trim() || undefined,
    });

    await AuditService.record({
      organizationId: targetOrgId,
      issuerId: issuer.id,
      userId: user.id,
      action: "issuer.created",
      entityType: "issuer",
      entityId: issuer.id,
      metadata: { name, slug },
    });

    return NextResponse.json({ issuer }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create issuer.");
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const body = (await request.json()) as {
      id?: string;
      status?: IssuerRecord["status"];
      name?: string;
      contactEmail?: string;
      didUri?: string;
      organizationId?: string;
    };

    const id = body.id?.trim();
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    // --- Transfer ---
    if (body.organizationId) {
      if (!user.roles.includes("platform-admin")) {
        return NextResponse.json({ error: "Requires the platform-admin role to transfer issuers." }, { status: 403 });
      }
      const newOrgId = body.organizationId.trim();
      if (!STATUSES.includes(body.status ?? "active")) {
        return NextResponse.json({ error: `transfer requires a valid status (${STATUSES.join(", ")}).` }, { status: 400 });
      }
      const issuer = await IssuerService.transfer(id, newOrgId);
      await AuditService.record({
        organizationId: issuer.organizationId,
        issuerId: issuer.id,
        userId: user.id,
        action: "issuer.transferred",
        entityType: "issuer",
        entityId: issuer.id,
        metadata: { fromOrganizationId: user.organizationId, toOrganizationId: newOrgId },
      });
      return NextResponse.json({ issuer });
    }

    if (!user.roles.includes("issuer-admin")) {
      return NextResponse.json({ error: "Requires the issuer-admin role." }, { status: 403 });
    }

    if (body.status) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}.` }, { status: 400 });
      }
      // Blocks an admin from locking their own organization out.
      if (id === user.issuerId && body.status !== "active") {
        return NextResponse.json({ error: "You cannot disable your own issuer." }, { status: 400 });
      }
      const issuer = await IssuerService.updateStatus(id, body.status, user.organizationId);
      await AuditService.record({
        organizationId: user.organizationId,
        issuerId: issuer.id,
        userId: user.id,
        action: "issuer.status_changed",
        entityType: "issuer",
        entityId: issuer.id,
        metadata: { status: body.status },
      });
      return NextResponse.json({ issuer });
    }

    const issuer = await IssuerService.update(id, user.organizationId, {
      name: body.name?.trim(),
      contactEmail: body.contactEmail?.trim(),
      didUri: body.didUri?.trim(),
    });
    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: issuer.id,
      userId: user.id,
      action: "issuer.updated",
      entityType: "issuer",
      entityId: issuer.id,
    });
    return NextResponse.json({ issuer });
  } catch (error) {
    return errorResponse(error, "Unable to update issuer.");
  }
}
