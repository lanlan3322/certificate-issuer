import { NextResponse } from "next/server";
import {
  createTrustVCDocumentLoader,
  computeDocumentStoreHash,
  getTrustVCContextUrls,
  verifyCredential,
  type VerificationResult,
} from "../../../lib/trustvc";
import { checkHashRegistration } from "../../../lib/document-store";
import { CredentialService } from "../../../services/CredentialService";
import { VerificationService } from "../../../services/VerificationService";
import { createSafeDocumentLoader } from "../../../lib/safe-document-loader";
import { clientIp } from "../../../lib/apiAuth";
import { enforceRateLimit, RateLimitError } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 5 * 1024 * 1024;
const VERIFICATION_LIMIT = 30;
const VERIFICATION_WINDOW_MINUTES = 15;

class RequestTooLargeError extends Error {}
class InvalidRequestBodyError extends Error {}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestTooLargeError("Verification request exceeds the size limit.");
  }
  if (!request.body) throw new InvalidRequestBodyError("Verification request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new RequestTooLargeError("Verification request exceeds the size limit.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InvalidRequestBodyError("Verification request must contain valid UTF-8 JSON.");
  }
}

async function createVerificationDocumentLoader() {
  const baseLoader = await createTrustVCDocumentLoader();
  const localContextUrls = await getTrustVCContextUrls();
  // Always resolve issuer DIDs from their published documents. The base
  // TrustVC loader contains only the legacy local key and can be stale after rotation.
  return createSafeDocumentLoader(
    baseLoader,
    localContextUrls,
    new Set()
  ) as import("@trustvc/w3c-context").DocumentLoader;
}

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
    await enforceRateLimit(
      "verification:ip",
      clientIp(request),
      VERIFICATION_LIMIT,
      VERIFICATION_WINDOW_MINUTES
    );
    const parsedBody = await readJsonBody(request);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      throw new InvalidRequestBodyError("Verification request must be a JSON object.");
    }
    const body = parsedBody as {
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
    let record: Awaited<ReturnType<typeof CredentialService.findForPublicVerification>> = null;
    if (externalId) {
      try {
        record = await CredentialService.findForPublicVerification(externalId);
      } catch (lookupError) {
        if (!submittedCredential) {
          throw lookupError;
        }
        console.error("Credential lookup failed during submitted credential verification", lookupError);
      }
    }
    const credentialToVerify = submittedCredential ?? record?.credential ?? null;
    const found = Boolean(record);
    const status = record?.status ? String(record.status) : null;
    const expired = Boolean(record?.validUntil && new Date(String(record.validUntil)) < new Date());
    const cryptographicResult: VerificationResult = credentialToVerify
      ? await verifyCredential(credentialToVerify, {
          documentLoader: await createVerificationDocumentLoader(),
        })
      : {
          valid: false,
          message: "Credential not found.",
        };
    // The W3C status-list document deliberately omits its separate chain anchor.
    // Only use persisted issuer/store metadata when it matches this exact file.
    if (cryptographicResult.valid && credentialToVerify && record?.issuingMethods?.includes("ethereum") &&
        cryptographicResult.details?.blockchainVerification === "not required") {
      const targetHash = computeDocumentStoreHash(credentialToVerify);
      if (!record.documentHash || record.documentHash.toLowerCase() !== targetHash.toLowerCase()) {
        cryptographicResult.details = { ...cryptographicResult.details, blockchainVerification: "unavailable",
          blockchainReason: "Submitted document does not match the saved blockchain anchor." };
      } else if (!record.documentStoreAddress || !record.documentStoreNetwork) {
        cryptographicResult.details = { ...cryptographicResult.details, blockchainVerification: "unavailable",
          blockchainReason: "Saved issuer Document Store configuration is unavailable." };
      } else {
        try {
          const { issued, revoked } = await checkHashRegistration(targetHash, {
            address: record.documentStoreAddress, network: record.documentStoreNetwork,
          });
          cryptographicResult.details = { ...cryptographicResult.details,
            blockchainVerification: issued && !revoked ? "passed" : "failed",
            documentStoreAddress: record.documentStoreAddress,
            documentStoreNetwork: record.documentStoreNetwork, targetHash, revoked };
        } catch {
          console.error("[verification] Saved Document Store anchor lookup failed.");
          cryptographicResult.details = { ...cryptographicResult.details, blockchainVerification: "unavailable",
            blockchainReason: "Unable to check the saved Document Store anchor." };
        }
      }
    }
    // A credential that exists but is revoked, suspended, or past its validity
    // window must not be reported as verified.
    const verified = cryptographicResult.valid && (!record || (status === "issued" && !expired));

    const sourceIp = clientIp(request);

    try {
      await VerificationService.log({
        credentialId: record?.id,
        externalId: externalId || undefined,
        verified,
        result: { found, status, expired, cryptographicResult },
        sourceIp,
      });
    } catch (logError) {
      console.error("Credential verification log failed", logError);
    }

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
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof RequestTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof InvalidRequestBodyError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid request body." },
        { status: 400 }
      );
    }
    console.error("Credential verification failed", error);
    return NextResponse.json(
      {
        valid: false,
        verified: false,
        error: "Unable to verify credential.",
        message: "Unable to verify credential.",
      },
      { status: 500 }
    );
  }
}
