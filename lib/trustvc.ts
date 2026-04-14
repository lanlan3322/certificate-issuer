// TrustVC SDK Integration for Certificate Issuance
// Uses @trustvc/trustvc for W3C Verifiable Credentials

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

// Build the W3C Verifiable Credential payload
export function buildVCPayload(data: CertificateData) {
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://w3id.org/security/data-integrity/v2",
      "https://trustvc.io/context/certificate-vocab.json",
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
      id: `https://tradetrust.io/status/${data.id}#list`,
      type: "BitstringStatusListEntry",
      statusPurpose: "revocation",
      statusListIndex: "0",
      statusListCredential:
        "https://tradetrust.io/status/credentials/statuslist-1",
    },
  };
}

// Note: Actual signing requires a valid key pair
// For demo purposes, we create the unsigned credential
export async function createUnsignedCredential(
  data: CertificateData
): Promise<Record<string, unknown>> {
  return buildVCPayload(data);
}

// Verify a credential document
export interface VerificationResult {
  valid: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// For demo purposes - in production, this would call verifyDocument from TrustVC
export async function verifyCredential(
  document: Record<string, unknown>
): Promise<VerificationResult> {
  try {
    // Basic structural validation
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

    // Check for proof presence (signature)
    const proof = document["proof"] as Record<string, unknown>;
    if (!proof || !proof["proofValue"]) {
      return {
        valid: false,
        message: "Credential is not signed - missing proof",
      };
    }

    return {
      valid: true,
      message: "Credential verified successfully",
      details: {
        issuer: (document["issuer"] as Record<string, string>)["id"],
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

// Export for use in components
export { TRUSTVC_CONFIG };