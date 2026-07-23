// TrustVC SDK Integration for Certificate Issuance
// Uses @trustvc/trustvc for W3C Verifiable Credentials

// Use the sub-path import to avoid pulling in Node.js-only utilities
// (dotenv/config, core-js) from the @trustvc/trustvc main entry.
import { signW3C, type PrivateKeyPair } from "@trustvc/trustvc/w3c";
import { ethers } from "ethers";
import {
  DEFAULT_ISSUING_METHODS,
  IssuingMethod,
  TRUSTVC_CONFIG,
} from "./constants";

// Minimal ABI for the OpenAttestation DocumentStore `issue` function.
// This avoids importing the full @trustvc/trustvc package (which pulls in
// dotenv and other Node.js-only modules) in the browser bundle.
const DOCUMENT_STORE_ABI = [
  {
    inputs: [{ internalType: "bytes32", name: "document", type: "bytes32" }],
    name: "issue",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "document", type: "bytes32" }],
    name: "isIssued",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

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
  issuingMethods?: IssuingMethod[];
}

// Generate a UUID for certificate
export function generateCertificateId(): string {
  return `urn:uuid:${crypto.randomUUID()}`;
}

// Build the W3C Verifiable Credential payload
export function buildVCPayload(data: CertificateData) {
  const issuingMethods =
    data.issuingMethods && data.issuingMethods.length > 0
      ? data.issuingMethods
      : DEFAULT_ISSUING_METHODS;

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
    issuingMethods,
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

// ---------------------------------------------------------------------------
// DID Certificate Issuance
// ---------------------------------------------------------------------------

/**
 * Reads the DID key pair from NEXT_PUBLIC_DID_* environment variables.
 * Returns null when the variables are not set (unsigned/demo mode).
 *
 * All four variables must be present; if any one is missing the function
 * returns null and credentials are issued as unsigned drafts.
 *
 * Required variables (all must be set together):
 *   NEXT_PUBLIC_DID_KEY_ID              – full key URL, e.g. did:web:example.com#key-1
 *   NEXT_PUBLIC_DID_CONTROLLER          – DID controller, e.g. did:web:example.com
 *   NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE  – multibase-encoded public key (starts with "z")
 *   NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE – multibase-encoded private key (starts with "z")
 */
export function getDIDKeyPairFromEnv(): PrivateKeyPair | null {
  const id = process.env.NEXT_PUBLIC_DID_KEY_ID;
  const controller = process.env.NEXT_PUBLIC_DID_CONTROLLER;
  const publicKeyMultibase = process.env.NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE;
  const secretKeyMultibase =
    process.env.NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE;

  if (!id || !controller || !publicKeyMultibase || !secretKeyMultibase) {
    return null;
  }

  return {
    id,
    type: "Multikey",
    controller,
    publicKeyMultibase,
    secretKeyMultibase,
  } as PrivateKeyPair;
}

export interface DIDIssuanceResult {
  /** The credential JSON (signed when `signed` is true, otherwise unsigned draft) */
  credential: Record<string, unknown>;
  /** True when the credential was successfully signed with the DID key pair */
  signed: boolean;
  /** Human-readable error/warning message */
  error?: string;
}

/**
 * Issues a W3C Verifiable Credential using DID signing (ecdsa-sd-2023).
 *
 * When the DID key pair is configured via NEXT_PUBLIC_DID_* env vars the
 * credential is cryptographically signed and returned with a `proof` block.
 * Without those variables it returns the unsigned draft and sets `signed: false`.
 */
export async function issueDIDCertificate(
  data: CertificateData
): Promise<DIDIssuanceResult> {
  if (!data.recipientName || !data.recipientEmail) {
    return {
      credential: {} as Record<string, unknown>,
      signed: false,
      error: "Recipient name and email are required for DID issuance.",
    };
  }

  const credential = buildVCPayload(data) as unknown as Record<string, unknown>;
  const keyPair = getDIDKeyPairFromEnv();

  if (!keyPair) {
    return {
      credential,
      signed: false,
      error:
        "DID key pair not configured. " +
        "Set NEXT_PUBLIC_DID_KEY_ID, NEXT_PUBLIC_DID_CONTROLLER, " +
        "NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE, and " +
        "NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE to enable cryptographic signing.",
    };
  }

  try {
    const result = await signW3C(
      credential as Parameters<typeof signW3C>[0],
      keyPair
    );
    if (result.error) {
      return { credential, signed: false, error: result.error };
    }
    if (!result.signed) {
      return { credential, signed: false, error: "Signing returned no result." };
    }
    return {
      credential: result.signed as unknown as Record<string, unknown>,
      signed: true,
    };
  } catch (err) {
    return {
      credential,
      signed: false,
      error: `DID signing failed: ${(err as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Ethereum Document Store Issuance
// ---------------------------------------------------------------------------

export interface EthereumIssuanceResult {
  txHash?: string;
  documentHash?: string;
  error?: string;
}

/**
 * Produces a canonical JSON string from an object by sorting all keys
 * recursively. This ensures the resulting string — and therefore the document
 * hash — is identical regardless of the order in which properties were added
 * to the credential object.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = (value as Record<string, unknown>)[key];
      return acc;
    }, {});
  return JSON.stringify(
    sorted,
    (_k, v) =>
      v !== null && typeof v === "object" && !Array.isArray(v)
        ? Object.keys(v)
            .sort()
            .reduce<Record<string, unknown>>((a, k) => {
              a[k] = (v as Record<string, unknown>)[k];
              return a;
            }, {})
        : v
  );
}

/**
 * Issues the credential hash to an OpenAttestation Document Store contract on
 * Ethereum.  The document hash is keccak256(canonicalJson(credential)).
 * Canonical serialisation (sorted keys) ensures the hash is stable regardless
 * of JavaScript property insertion order.
 *
 * Requires an ethers v5 signer connected to the correct network (Sepolia).
 */
export async function issueCertificateToEthereum(
  credential: Record<string, unknown>,
  documentStoreAddress: string,
  signer: ethers.Signer
): Promise<EthereumIssuanceResult> {
  if (!documentStoreAddress) {
    return { error: "Document store address is required." };
  }

  try {
    const documentHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(canonicalJson(credential))
    );

    // Use ethers v5 directly with a minimal DocumentStore ABI to avoid
    // pulling in Node.js-only dependencies from @trustvc/trustvc.
    const contract = new ethers.Contract(
      documentStoreAddress,
      DOCUMENT_STORE_ABI,
      signer
    );

    // callStatic.issue simulates the transaction without sending it.
    // This catches permission errors and "already issued" conditions
    // before spending gas on a transaction that would revert.
    try {
      await contract.callStatic.issue(documentHash);
    } catch (staticErr) {
      const staticMsg = (staticErr as Error).message ?? String(staticErr);
      if (
        staticMsg.includes("already issued") ||
        staticMsg.includes("DocumentIssuedPreviously")
      ) {
        return { error: "This document has already been issued." };
      }
      return {
        error:
          "Pre-check failed — the wallet may not have issuer permissions on " +
          "this document store, or the document was already issued. " +
          `(${staticMsg})`,
      };
    }

    const tx: ethers.ContractTransaction = await contract.issue(documentHash);
    const receipt = await tx.wait();

    return {
      txHash: receipt.transactionHash,
      documentHash,
    };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);

    if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
      return { error: "Transaction rejected by user." };
    }
    if (
      msg.includes("network changed") ||
      msg.includes("chain") ||
      msg.includes("NETWORK_ERROR")
    ) {
      return {
        error:
          "Network mismatch. Please switch MetaMask to the Sepolia testnet " +
          "and try again.",
      };
    }
    if (msg.includes("insufficient funds")) {
      return {
        error:
          "Insufficient Sepolia ETH to cover gas. Get test ETH from a faucet.",
      };
    }
    return { error: msg };
  }
}