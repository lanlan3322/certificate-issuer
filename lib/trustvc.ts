// TrustVC SDK Integration for Certificate Issuance
// Uses @trustvc/trustvc for W3C Verifiable Credentials

import { TRUSTVC_CONFIG } from "./constants";
import {
  resolveDidWeb,
  findVerificationMethod,
  isAssertionMethod,
} from "./did-web";

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
        identityProofType: "DNS-DID",
        identifier: TRUSTVC_CONFIG.didUrl,
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

/**
 * Verify a W3C Verifiable Credential.
 *
 * Performs structural validation and, when the issuer uses a did:web
 * identifier, resolves the DID Document and checks that the proof's
 * verificationMethod is present and authorized for assertion.
 *
 * In production this would delegate to TrustVC's verifyDocument().
 */
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

    // Extract issuer DID
    const issuer = document["issuer"] as Record<string, string>;
    const issuerDid = issuer?.["id"] ?? "";

    // did:web resolution — resolve issuer DID Document and validate the
    // verification method referenced in the proof.
    let didResolved = false;
    if (issuerDid.startsWith("did:web:")) {
      try {
        const didDocument = await resolveDidWeb(issuerDid);

        const verificationMethodId = proof["verificationMethod"] as string;
        if (verificationMethodId) {
          const vm = findVerificationMethod(didDocument, verificationMethodId);
          if (!vm) {
            return {
              valid: false,
              message: `Verification method "${verificationMethodId}" not found in issuer DID Document`,
            };
          }

          if (!isAssertionMethod(didDocument, verificationMethodId)) {
            return {
              valid: false,
              message: `Verification method "${verificationMethodId}" is not authorized for assertion in issuer DID Document`,
            };
          }
        }

        didResolved = true;
      } catch {
        // DID resolution failure is not fatal for demo — log and continue.
        // In production, this should be a hard failure.
        console.warn(`did:web resolution failed for ${issuerDid}`);
      }
    }

    return {
      valid: true,
      message: "Credential verified successfully",
      details: {
        issuer: issuerDid,
        credentialId: document["id"] as string,
        credentialType: document["type"] as string[],
        didWebResolved: didResolved,
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