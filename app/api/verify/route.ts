import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../lib/db";
import { VerificationService } from "../../../services/VerificationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { externalId?: string };
    const externalId = typeof body.externalId === "string" ? body.externalId : undefined;
    if (!externalId) {
      return NextResponse.json({ error: "externalId is required." }, { status: 400 });
    }

    const record = await VerificationService.findByExternalId(externalId);
    const verified = Boolean(record);

    const forwardedFor = request.headers.get("x-forwarded-for");
    const sourceIp = forwardedFor?.split(",")[0].trim() || undefined;

    await VerificationService.log({
      credentialId: typeof record?.id === "string" ? record.id : undefined,
      externalId,
      verified,
      result: { found: verified },
      sourceIp,
    });

    // This endpoint is public, so only the credential's verification state is
    // returned — never the stored recipient details.
    return NextResponse.json({
      verified,
      credential: verified
        ? {
            externalId,
            status: record?.status,
            issuedAt: record?.issued_at,
            validFrom: record?.valid_from,
            validUntil: record?.valid_until,
            issuingMethods: record?.issuing_methods,
            documentHash: record?.document_hash,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Credential verification failed", error);
    return NextResponse.json({ error: "Unable to verify credential." }, { status: 400 });
  }
}
