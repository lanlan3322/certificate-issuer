import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";
import { CredentialService, DuplicateCredentialError } from "../../../services/CredentialService";
import { canAccessIssuer, hasPermission, isPlatformAdmin } from "../../../lib/permissions";
import { requireIssuerAccess } from "../../../lib/issuer-access";
import { TemplateService } from "../../../services/TemplateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const params = new URL(request.url).searchParams;
    if (hasPermission(user, "credentials.revoke")) await CredentialService.expireOverdue(user.issuerId);
    return NextResponse.json({
      credentials: (await CredentialService.list(user.issuerId, {
        status: params.get("status") ?? undefined,
        limit: params.get("limit") ? Number(params.get("limit")) : undefined,
        platformAdmin: isPlatformAdmin(user),
        organizationId: user.organizationId,
      })).filter((record) => canAccessIssuer(user, { id: record.issuerId, organizationId: record.organizationId }))
        .map((record) => ({ ...record, canManage: canAccessIssuer(user, {
          id: record.issuerId, organizationId: record.organizationId,
        }, "operate") })),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load credentials.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize("credentials.issue");
  if (response) return response;
  try {
    const body = (await request.json()) as {
      templateId?: string;
      externalId?: string;
      recipientName?: string;
      recipientEmail?: string;
      credential?: Record<string, unknown>;
      documentHash?: string;
      issuingMethods?: string[];
      validFrom?: string;
      validUntil?: string;
    };

    if (!body.externalId || !body.recipientName || !body.recipientEmail || !body.credential) {
      return NextResponse.json(
        { error: "externalId, recipientName, recipientEmail, and credential are required." },
        { status: 400 }
      );
    }

    if (!body.templateId) return NextResponse.json({ error: "Select a saved template." }, { status: 400 });
    const template = await TemplateService.getAvailableForIssuance(body.templateId, {
      organizationId: user.organizationId, platformAdmin: isPlatformAdmin(user),
    });
    if (!template?.issuerId) return NextResponse.json({ error: "Active template not found." }, { status: 404 });
    const issuer = await requireIssuerAccess(user, template.issuerId, "operate", true);
    const credential = await CredentialService.create({
      issuerId: issuer.id,
      templateId: template.id,
      externalId: body.externalId,
      recipientName: body.recipientName,
      recipientEmail: body.recipientEmail,
      credential: body.credential,
      documentHash: body.documentHash,
      issuingMethods: body.issuingMethods,
      validFrom: body.validFrom,
      validUntil: body.validUntil,
    });

    await AuditService.record({
      organizationId: issuer.organizationId,
      issuerId: issuer.id,
      userId: user.id,
      action: "credential.stored",
      entityType: "credential",
      entityId: credential.id,
      metadata: { externalId: body.externalId },
    });

    return NextResponse.json({ credential }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateCredentialError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return errorResponse(error, "Unable to store credential.");
  }
}

/** Attaches the on-chain document hash once the wallet transaction confirms. */
export async function PATCH(request: Request) {
  const { user, response } = await authorize("credentials.issue");
  if (response) return response;
  try {
    const body = (await request.json()) as { externalId?: string; documentHash?: string };
    if (!body.externalId || !body.documentHash) {
      return NextResponse.json({ error: "externalId and documentHash are required." }, { status: 400 });
    }

    const existing = await CredentialService.findByExternalId(body.externalId);
    if (!existing) return NextResponse.json({ error: "Credential not found." }, { status: 404 });
    await requireIssuerAccess(user, existing.issuerId, "operate", true);
    const credential = await CredentialService.attachDocumentHash(body.externalId, existing.issuerId, body.documentHash);
    if (!credential) return NextResponse.json({ error: "Credential not found." }, { status: 404 });

    await AuditService.record({
      organizationId: credential.organizationId,
      issuerId: credential.issuerId,
      userId: user.id,
      action: "credential.anchored",
      entityType: "credential",
      entityId: credential.id,
      metadata: { documentHash: body.documentHash },
    });

    return NextResponse.json({ credential });
  } catch (error) {
    return errorResponse(error, "Unable to update credential.");
  }
}
