import { NextResponse } from "next/server";
import {
  createRevocationRecord,
  reinstateCredential,
  revokeCredential,
  suspendCredential,
  type RevocationRecord,
} from "../../../lib/phase3";

const revocationRegistry = new Map<string, RevocationRecord>();

export async function GET() {
  return NextResponse.json({
    records: Array.from(revocationRegistry.values()).sort((a, b) =>
      a.updatedAt.localeCompare(b.updatedAt)
    ),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      credentialId?: string;
      action?: "revoke" | "suspend" | "reinstate";
      reason?: string;
    };

    const credentialId = body.credentialId?.trim();
    const action = body.action;
    const reason = body.reason?.trim() || "Operational action";

    if (!credentialId || !action) {
      return NextResponse.json(
        { error: "credentialId and action are required." },
        { status: 400 }
      );
    }

    const existing = revocationRegistry.get(credentialId) ?? createRevocationRecord(credentialId, reason);
    let record = existing;

    if (action === "revoke") {
      if (existing.status === "revoked") {
        return NextResponse.json(
          { error: `Credential ${credentialId} is already revoked.` },
          { status: 409 }
        );
      }
      record = revokeCredential(existing, reason);
    } else if (action === "suspend") {
      if (existing.status === "revoked") {
        return NextResponse.json(
          { error: `Credential ${credentialId} cannot be suspended after revocation.` },
          { status: 409 }
        );
      }
      record = suspendCredential(existing, reason);
    } else if (action === "reinstate") {
      if (existing.status === "active") {
        return NextResponse.json(
          { error: `Credential ${credentialId} is already active.` },
          { status: 409 }
        );
      }
      record = reinstateCredential(existing, reason);
    } else {
      return NextResponse.json(
        { error: `Unsupported action: ${String(action)}` },
        { status: 400 }
      );
    }

    revocationRegistry.set(credentialId, record);
    return NextResponse.json({ record }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update revocation status." },
      { status: 400 }
    );
  }
}
