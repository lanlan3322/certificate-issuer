import { NextRequest, NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../../lib/apiAuth";
import { AuditService } from "../../../../services/AuditService";
import { IssuerService, type IssuerRecord } from "../../../../services/IssuerService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: IssuerRecord["status"][] = ["active", "disabled", "suspended"];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/");
  const id = pathSegments[pathSegments.length - 1];

  if (!id) {
    return NextResponse.json({ error: "Issuer ID is required." }, { status: 400 });
  }

  const { user, response } = await authorize();
  if (response) return response;

  try {
    const issuers = await IssuerService.list(user.organizationId);
    const issuer = issuers.find((i) => i.id === id);

    if (!issuer) {
      return NextResponse.json({ error: "Issuer not found." }, { status: 404 });
    }

    return NextResponse.json({ issuer });
  } catch (error) {
    return errorResponse(error, "Unable to load issuer.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await authorize("issuer-admin");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/");
    const id = pathSegments[pathSegments.length - 1];

    if (!id) {
      return NextResponse.json({ error: "Issuer ID is required." }, { status: 400 });
    }

    const body = (await request.json()) as {
      status?: IssuerRecord["status"];
      name?: string;
      contactEmail?: string;
      didUri?: string;
    };

    // Add a getById method to IssuerService if we want efficient single-fetch
    const issuers = await IssuerService.list(user.organizationId);
    const issuer = issuers.find((i) => i.id === id);

    if (!issuer) {
      return NextResponse.json({ error: "Issuer not found." }, { status: 404 });
    }

    // Blocks an admin from locking their own issuer out.
    if (id === user.issuerId && body.status && body.status !== "active") {
      return NextResponse.json({ error: "You cannot disable your own issuer." }, { status: 400 });
    }

    let result: IssuerRecord;

    if (body.status) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}.` }, { status: 400 });
      }
      result = await IssuerService.updateStatus(id, body.status, user.organizationId);
      await AuditService.record({
        organizationId: user.organizationId,
        issuerId: result.id,
        userId: user.id,
        action: "issuer.status_changed",
        entityType: "issuer",
        entityId: result.id,
        metadata: { status: body.status },
      });
    } else {
      result = await IssuerService.update(id, user.organizationId, {
        name: body.name?.trim(),
        contactEmail: body.contactEmail?.trim(),
        didUri: body.didUri?.trim() || undefined,
      });
      await AuditService.record({
        organizationId: user.organizationId,
        issuerId: result.id,
        userId: user.id,
        action: "issuer.updated",
        entityType: "issuer",
        entityId: result.id,
      });
    }

    return NextResponse.json({ issuer: result });
  } catch (error) {
    return errorResponse(error, "Unable to update issuer.", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await authorize("issuer-admin");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/");
    const id = pathSegments[pathSegments.length - 1];

    if (!id) {
      return NextResponse.json({ error: "Issuer ID is required." }, { status: 400 });
    }

    // Blocks an admin from deleting their own issuer.
    if (id === user.issuerId) {
      return NextResponse.json({ error: "You cannot delete your own issuer." }, { status: 400 });
    }

    const issuers = await IssuerService.list(user.organizationId);
    const issuer = issuers.find((i) => i.id === id);

    if (!issuer) {
      return NextResponse.json({ error: "Issuer not found." }, { status: 404 });
    }

    // Soft delete: set status to suspended (irreversible)
    const result = await IssuerService.updateStatus(id, "suspended", user.organizationId);

    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: result.id,
      userId: user.id,
      action: "issuer.deleted",
      entityType: "issuer",
      entityId: result.id,
    });

    return NextResponse.json({ issuer: result });
  } catch (error) {
    return errorResponse(error, "Unable to delete issuer.", 500);
  }
}
