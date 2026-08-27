import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { buildVCPayload, getDIDKeyPairFromEnv, signDocumentWithDID } from "../../../lib/trustvc";
import { AuditService } from "../../../services/AuditService";
import { CredentialService, DuplicateCredentialError } from "../../../services/CredentialService";
import type { CertificateData } from "../../../lib/trustvc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FIELD = 512;

function validate(data: Record<string, unknown>): { ok: true; value: CertificateData } | { ok: false; error: string } {
  const str = (key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");

  const id = str("id");
  const recipientName = str("recipientName");
  const recipientEmail = str("recipientEmail");
  const certificateType = str("certificateType");

  if (!id) return { ok: false, error: "id is required." };
  if (!recipientName) return { ok: false, error: "recipientName is required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) return { ok: false, error: "A valid recipientEmail is required." };
  if (!certificateType) return { ok: false, error: "certificateType is required." };

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && value.length > MAX_FIELD) {
      return { ok: false, error: `${key} exceeds ${MAX_FIELD} characters.` };
    }
  }

  const methods = Array.isArray(data.issuingMethods)
    ? (data.issuingMethods as unknown[]).filter((m): m is string => m === "did" || m === "ethereum")
    : ["did"];

  return {
    ok: true,
    value: {
      ...(data as unknown as CertificateData),
      id,
      recipientName,
      recipientEmail,
      certificateType,
      issuingMethods: methods as CertificateData["issuingMethods"],
    },
  };
}

export async function POST(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;

  try {
    const body = (await request.json()) as {
      data?: Record<string, unknown>;
      type?: "did" | "ethereum";
      templateId?: string;
      persist?: boolean;
    };

    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json({ error: "Missing credential payload." }, { status: 400 });
    }

    const validated = validate(body.data);
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    const data = validated.value;

    if ((body.type ?? "did") !== "did") {
      return NextResponse.json(
        { error: "Ethereum anchoring is performed client-side with the connected wallet." },
        { status: 400 }
      );
    }

    if (!getDIDKeyPairFromEnv()) {
      return NextResponse.json(
        {
          signed: false,
          credential: buildVCPayload(data),
          error:
            "DID signing is not configured in the server environment. Set DID_KEY_ID, DID_CONTROLLER, DID_PUBLIC_KEY_MULTIBASE, and DID_PRIVATE_KEY_MULTIBASE.",
        },
        { status: 503 }
      );
    }

    const result = await signDocumentWithDID(buildVCPayload(data));
    if (!result.signed) {
      return NextResponse.json(
        { signed: false, credential: result.credential, error: result.error ?? "Signing failed." },
        { status: 500 }
      );
    }

    let stored: { id: string } | null = null;
    if (body.persist !== false) {
      try {
        const record = await CredentialService.create({
          issuerId: user.issuerId,
          templateId: body.templateId,
          externalId: data.id,
          recipientName: data.recipientName,
          recipientEmail: data.recipientEmail,
          credential: result.credential,
          issuingMethods: data.issuingMethods,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
        });
        stored = { id: record.id };
        await AuditService.record({
          organizationId: user.organizationId,
          issuerId: user.issuerId,
          userId: user.id,
          action: "credential.issued",
          entityType: "credential",
          entityId: record.id,
          metadata: { externalId: data.id, methods: data.issuingMethods },
        });
      } catch (storeError) {
        if (storeError instanceof DuplicateCredentialError) {
          return NextResponse.json({ signed: false, error: storeError.message }, { status: 409 });
        }
        throw storeError;
      }
    }

    return NextResponse.json({ signed: true, credential: result.credential, stored });
  } catch (error) {
    return errorResponse(error, "Unable to issue credential.", 500);
  }
}
