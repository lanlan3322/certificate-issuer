import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";
import { IssuerService, type IssuerRecord } from "../../../services/IssuerService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: IssuerRecord["status"][] = ["active", "disabled", "suspended"];

export async function GET() {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    return NextResponse.json({ issuers: await IssuerService.list(user.organizationId) });
  } catch (error) {
    return errorResponse(error, "Unable to load issuers.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize("issuer-admin");
  if (response) return response;
  try {
    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      contactEmail?: string;
      didUri?: string;
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

    // organizationId comes from the session, never the request body.
    const issuer = await IssuerService.create({
      organizationId: user.organizationId,
      name,
      slug,
      contactEmail,
      didUri: body.didUri?.trim() || undefined,
    });

    await AuditService.record({
      organizationId: user.organizationId,
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
  const { user, response } = await authorize("issuer-admin");
  if (response) return response;
  try {
    const body = (await request.json()) as {
      id?: string;
      status?: IssuerRecord["status"];
      name?: string;
      contactEmail?: string;
      didUri?: string;
    };

    const id = body.id?.trim();
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

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
