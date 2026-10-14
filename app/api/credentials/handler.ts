import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";
import { CredentialService, DuplicateCredentialError } from "../../../services/CredentialService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const params = new URL(request.url).searchParams;
    await CredentialService.expireOverdue(user.issuerId);
    return NextResponse.json({
      credentials: await CredentialService.list(user.issuerId, {
        status: params.get("status") ?? undefined,
        limit: params.get("limit") ? Number(params.get("limit")) : undefined,
      }),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load credentials.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize();
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

    // issuerId always comes from the session, never the body.
    const credential = await CredentialService.create({
      issuerId: user.issuerId,
      templateId: body.templateId,
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
      organizationId: user.organizationId,
      issuerId: user.issuerId,
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
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const body = (await request.json()) as { externalId?: string; documentHash?: string };
    if (!body.externalId || !body.documentHash) {
      return NextResponse.json({ error: "externalId and documentHash are required." }, { status: 400 });
    }

    const credential = await CredentialService.attachDocumentHash(body.externalId, user.issuerId, body.documentHash);
    if (!credential) return NextResponse.json({ error: "Credential not found." }, { status: 404 });

    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: user.issuerId,
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
