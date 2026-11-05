import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";
import { CredentialService } from "../../../services/CredentialService";
import { requireIssuerAccess } from "../../../lib/issuer-access";
import {
  CredentialNotFoundError,
  DocumentStoreRevocationError,
  RevocationService,
  RevocationStateError,
  type RevocationAction,
} from "../../../services/RevocationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: RevocationAction[] = ["revoke", "suspend", "reinstate"];

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const limit = new URL(request.url).searchParams.get("limit");
    return NextResponse.json({
      records: await RevocationService.list(undefined, limit ? Number(limit) : undefined),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load revocation records.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize("credentials.revoke");
  if (response) return response;
  try {
    const body = (await request.json()) as {
      credentialId?: string;
      action?: RevocationAction;
      reason?: string;
      transactionHash?: string;
    };

    const credentialRef = body.credentialId?.trim();
    if (!credentialRef) return NextResponse.json({ error: "credentialId is required." }, { status: 400 });
    if (!body.action || !ACTIONS.includes(body.action)) {
      return NextResponse.json({ error: `action must be one of ${ACTIONS.join(", ")}.` }, { status: 400 });
    }
    const reason = body.reason?.trim();
    if (!reason) return NextResponse.json({ error: "reason is required." }, { status: 400 });

    const credential = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credentialRef)
      ? await CredentialService.get(credentialRef) : await CredentialService.findByExternalId(credentialRef);
    if (!credential) return NextResponse.json({ error: "Credential not found." }, { status: 404 });
    await requireIssuerAccess(user, credential.issuerId, "operate", true);
    const { issuerId, organizationId } = credential;
    const record = await RevocationService.apply({
      credentialRef,
      issuerId,
      action: body.action,
      reason,
      transactionHash: body.transactionHash,
    });

    await AuditService.record({
      organizationId,
      issuerId,
      userId: user.id,
      action: `credential.${body.action}`,
      entityType: "credential",
      entityId: record.credentialId,
      metadata: { reason, externalId: record.externalId, transactionHash: body.transactionHash ?? null },
    });

    return NextResponse.json({ record });
  } catch (error) {
    if (error instanceof CredentialNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof RevocationStateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof DocumentStoreRevocationError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return errorResponse(error, "Unable to update revocation status.");
  }
}
