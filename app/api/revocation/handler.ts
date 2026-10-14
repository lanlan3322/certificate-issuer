import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";
import {
  CredentialNotFoundError,
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
      records: await RevocationService.list(user.issuerId, limit ? Number(limit) : undefined),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load revocation records.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize();
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

    const record = await RevocationService.apply({
      credentialRef,
      issuerId: user.issuerId,
      action: body.action,
      reason,
      transactionHash: body.transactionHash,
    });

    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: user.issuerId,
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
    return errorResponse(error, "Unable to update revocation status.");
  }
}
