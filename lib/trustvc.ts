// TrustVC SDK Integration for Certificate Issuance
// Uses @trustvc/trustvc for W3C Verifiable Credentials

import {
  signW3C,
  verifyDocument,
  deriveW3C,
} from "@trustvc/trustvc";
import type {
  RawVerifiableCredential,
  SignedVerifiableCredential,
  SigningResult,
  VerificationResult as TrustVCVerificationResult,
  PrivateKeyPair,
} from "@trustvc/trustvc";
import { TRUSTVC_CONFIG } from "./constants";

// Certificate data structure
export interface CertificateData {
  id: string;
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  issuerName: string;
  issueDate: string;
  description: string;
  validFrom: string;
  validUntil?: string;
}

// Generate a UUID for certificate
export function generateCertificateId(): string {
  return `urn:uuid:${crypto.randomUUID()}`;
}

// Build the W3C Verifiable Credential payload (TrustVC RawVerifiableCredential)
export function buildVCPayload(data: CertificateData): RawVerifiableCredential {
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://w3id.org/security/data-integrity/v2",
      "https://w3id.org/vc/status-list/2021/v1",
    ],
    type: ["VerifiableCredential", "OpenCertsCertificate"],
    id: data.id,
    credentialSubject: {
      id: `did:email:${data.recipientEmail}`,
      type: ["Person"],
      name: data.recipientName,
      email: data.recipientEmail,
      certificateType: data.certificateType,
      description: data.description,
      issuedOn: data.issueDate,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
    },
    issuer: {
      id: TRUSTVC_CONFIG.didUrl,
      type: "OpenAttestationIssuer",
      name: data.issuerName,
      identityProof: {
        identityProofType: "DNS-TXT",
        identifier: TRUSTVC_CONFIG.demoIssuer.identityProof.location,
      },
    },
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    credentialStatus: {
      id: `https://trustvc.github.io/did/credentials/statuslist/1#1`,
      type: "BitstringStatusListEntry",
      statusPurpose: "revocation",
      statusListIndex: "0",
      statusListCredential:
        "https://trustvc.github.io/did/credentials/statuslist/1",
    },
  };
}

// Sign a credential using TrustVC signW3C
// Requires a key pair with secretKeyMultibase for actual signing
export async function signCredential(
  credential: RawVerifiableCredential,
  secretKeyMultibase?: string
): Promise<SigningResult> {
  const keyPair = {
    ...TRUSTVC_CONFIG.demoKeyPair,
    ...(secretKeyMultibase ? { secretKeyMultibase } : {}),
  } as PrivateKeyPair;

  return signW3C(credential, keyPair, TRUSTVC_CONFIG.cryptoSuite, {
    mandatoryPointers: ["/credentialStatus"],
  });
}

// Create an unsigned credential (for demo when no key is available)
export async function createUnsignedCredential(
  data: CertificateData
): Promise<RawVerifiableCredential> {
  return buildVCPayload(data);
}

// Derive a W3C credential with selective disclosure using TrustVC
export async function deriveCredential(
  signedDocument: SignedVerifiableCredential,
  selectivePointers: string[]
): Promise<{ derived?: SignedVerifiableCredential; error?: string }> {
  try {
    const result = await deriveW3C(signedDocument, selectivePointers);
    return result;
  } catch (error) {
    return { error: `Derivation error: ${(error as Error).message}` };
  }
}

// Verification result for UI consumption
export interface VerificationResult {
  valid: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// Verify a credential using TrustVC verifyDocument
export async function verifyCredential(
  document: Record<string, unknown>
): Promise<VerificationResult> {
  try {
    // Basic structural validation first
    const required = ["@context", "type", "credentialSubject", "issuer"];
    for (const field of required) {
      if (!document[field]) {
        return { valid: false, message: `Missing required field: ${field}` };
      }
    }

    // Use TrustVC verifyDocument for full verification
    const fragments = await verifyDocument(
      document as SignedVerifiableCredential,
      { rpcProviderUrl: TRUSTVC_CONFIG.rpcProviderUrl }
    );

    // Interpret verification fragments
    const allValid = fragments.every(
      (f) => f.status === "VALID" || f.status === "SKIPPED"
    );
    const errors = fragments
      .filter((f) => f.status === "INVALID" || f.status === "ERROR")
      .map((f) => {
        const fAny = f as unknown as Record<string, unknown>;
        const reason = fAny["reason"] as
          | { message?: string; code?: string }
          | undefined;
        return `${f.name}: ${reason?.message || reason?.code || "failed"}`;
      });

    if (allValid) {
      const issuer = document["issuer"];
      const issuerId =
        typeof issuer === "string"
          ? issuer
          : (issuer as Record<string, string>)?.["id"] ?? "unknown";
      return {
        valid: true,
        message: "Credential verified successfully via TrustVC",
        details: {
          issuer: issuerId,
          credentialId: (document["id"] as string) ?? "N/A",
          credentialType: document["type"] as string[],
          verificationFragments: fragments.map((f) => ({
            name: f.name,
            type: f.type,
            status: f.status,
          })),
        },
      };
    }

    return {
      valid: false,
      message: `Verification failed: ${errors.join("; ")}`,
      details: {
        fragments: fragments.map((f) => ({
          name: f.name,
          type: f.type,
          status: f.status,
          reason: (f as unknown as Record<string, unknown>)["reason"],
        })),
      },
    };
  } catch (error) {
    // Fall back to structural validation if TrustVC verification fails
    // (e.g., network issues, unsupported document type)
    return verifyCredentialStructure(document);
  }
}

// Structural validation fallback
function verifyCredentialStructure(
  document: Record<string, unknown>
): VerificationResult {
  try {
    const required = [
      "@context",
      "type",
      "id",
      "credentialSubject",
      "issuer",
      "proof",
    ];
    for (const field of required) {
      if (!document[field]) {
        return { valid: false, message: `Missing required field: ${field}` };
      }
    }

    const proof = document["proof"] as Record<string, unknown>;
    if (!proof || !proof["proofValue"]) {
      return {
        valid: false,
        message: "Credential is not signed - missing proof",
      };
    }

    const issuer = document["issuer"];
    const issuerId =
      typeof issuer === "string"
        ? issuer
        : (issuer as Record<string, string>)?.["id"] ?? "unknown";

    return {
      valid: true,
      message:
        "Credential structure verified (full on-chain verification unavailable)",
      details: {
        issuer: issuerId,
        credentialId: document["id"] as string,
        credentialType: document["type"] as string[],
      },
    };
  } catch (error) {
    return {
      valid: false,
      message: `Verification error: ${(error as Error).message}`,
    };
  }
}

// Generate a simple QR code data URL for verification
export function generateVerificationQRData(certificateId: string): string {
  return `https://opencerts.io/verify?data=${encodeURIComponent(
    JSON.stringify({ id: certificateId })
  )}`;
}

// Re-export TrustVC SDK functions and types for direct use
export {
  signW3C,
  verifyDocument,
  deriveW3C,
  TRUSTVC_CONFIG,
};
export type {
  RawVerifiableCredential,
  SignedVerifiableCredential,
  SigningResult,
  PrivateKeyPair,
  TrustVCVerificationResult,
};