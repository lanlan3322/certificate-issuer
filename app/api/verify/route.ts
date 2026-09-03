import { NextResponse } from "next/server";
import { verifyCredential, type VerificationResult } from "../../../lib/trustvc";
import { CredentialService } from "../../../services/CredentialService";
import { VerificationService } from "../../../services/VerificationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCredentialIdentifier(document: Record<string, unknown>): string | undefined {
  const credentialSubject = document.credentialSubject;
  if (credentialSubject && typeof credentialSubject === "object") {
    const certificateId = (credentialSubject as Record<string, unknown>).certificateId;
    if (typeof certificateId === "string" && certificateId.trim()) {
      return certificateId;
    }
  }

  return typeof document.id === "string" && document.id.trim() ? document.id : undefined;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      externalId?: string;
      credential?: Record<string, unknown>;
    };
    const submittedCredential =
      body.credential && typeof body.credential === "object" && !Array.isArray(body.credential)
        ? body.credential
        : null;
    const requestedExternalId = typeof body.externalId === "string" ? body.externalId.trim() : "";

    if (!requestedExternalId && !submittedCredential) {
      return NextResponse.json(
        { error: "externalId or credential is required." },
        { status: 400 }
      );
    }

    const externalId =
      requestedExternalId || (submittedCredential ? getCredentialIdentifier(submittedCredential) : "");
    const record = externalId ? await CredentialService.findByExternalId(externalId) : null;
    const credentialToVerify = submittedCredential ?? record?.credential ?? null;
    const found = Boolean(record);
    const status = record?.status ? String(record.status) : null;
    const expired = Boolean(record?.validUntil && new Date(String(record.validUntil)) < new Date());
    const cryptographicResult: VerificationResult = credentialToVerify
      ? await verifyCredential(credentialToVerify)
      : {
          valid: false,
          message: "Credential not found.",
        };
    // A credential that exists but is revoked, suspended, or past its validity
    // window must not be reported as verified.
    const verified = cryptographicResult.valid && (!record || (status === "issued" && !expired));

    const forwardedFor = request.headers.get("x-forwarded-for");
    const sourceIp = forwardedFor?.split(",")[0].trim() || undefined;

    await VerificationService.log({
      credentialId: record?.id,
      externalId: externalId || undefined,
      verified,
      result: { found, status, expired, cryptographicResult },
      sourceIp,
    });

    // This endpoint is public, so only the credential's verification state is
    // returned — never the stored recipient details.
    return NextResponse.json({
      verified,
      valid: verified,
      message: verified
        ? "Credential verified successfully."
        : cryptographicResult.message,
      details: cryptographicResult.details,
      reason: record
        ? expired
            ? "expired"
            : status !== "issued"
              ? status
              : cryptographicResult.valid
                ? null
                : "cryptographic_verification_failed"
        : submittedCredential
            ? cryptographicResult.valid
              ? null
              : "cryptographic_verification_failed"
            : "not_found",
      credential: found
        ? {
            externalId,
            status: expired ? "expired" : status,
            issuedAt: record?.issuedAt,
            validFrom: record?.validFrom,
            validUntil: record?.validUntil,
            issuingMethods: record?.issuingMethods,
            documentHash: record?.documentHash,
          }
        : null,
    });
  } catch (error) {
    console.error("Credential verification failed", error);
    return NextResponse.json(
      {
        valid: false,
        verified: false,
        error: "Unable to verify credential.",
        message: error instanceof Error ? error.message : "Unable to verify credential.",
      },
      { status: 400 }
    );
  }
}
