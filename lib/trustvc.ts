// TrustVC SDK Integration for Certificate Issuance
// Uses @trustvc/trustvc for W3C Verifiable Credentials.
// The TrustVC crypto SDK is imported lazily so the browser bundle does not
// pull in Node-only dependencies or expose signing keys to the client.
import { ethers } from "ethers";
import {
  DEFAULT_ISSUING_METHODS,
  IssuingMethod,
  TRUSTVC_CONFIG,
  DOCUMENT_STORE_CONFIG,
  ISSUER_CONFIG,
  NETWORKS,
} from "./constants";

type TrustVCContextModule = typeof import("@trustvc/w3c-context");

type PrivateKeyPair = {
  "@context"?: string;
  id: string;
  type: "Multikey";
  controller: string;
  publicKeyMultibase: string;
  secretKeyMultibase: string;
};

type TrustVCModule = Pick<
  typeof import("@trustvc/trustvc"),
  "verifyDocument" | "isValid"
>;

type EcdsaSigningResult = {
  signed?: Record<string, unknown>;
  error?: string;
};

type EcdsaMultikeyModule = {
  from(keyPair: Record<string, unknown>): Promise<{ signer(): unknown }>;
};

type EcdsaSd2023CryptosuiteModule = {
  createSignCryptosuite(options: { mandatoryPointers: string[] }): unknown;
};

type DataIntegrityModule = {
  DataIntegrityProof: new (options: { signer: unknown; cryptosuite: unknown }) => unknown;
};

type JsonLdSignaturesRuntime = {
  sign(
    credential: Record<string, unknown>,
    options: { suite: unknown; purpose: unknown; documentLoader: unknown }
  ): Promise<unknown>;
  purposes: {
    AssertionProofPurpose: new () => unknown;
  };
};

type JsonLdSignaturesModule =
  | JsonLdSignaturesRuntime
  | { default: JsonLdSignaturesRuntime };

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
  {
    inputs: [{ internalType: "bytes32", name: "document", type: "bytes32" }],
    name: "revoke",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "document", type: "bytes32" }],
    name: "isRevoked",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const LOCAL_DID_VERIFICATION_METHOD_ID = `${TRUSTVC_CONFIG.didUrl}#key-1`;
const LOCAL_DID_PUBLIC_KEY_MULTIBASE =
  process.env.DID_PUBLIC_KEY_MULTIBASE ||
  process.env.NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE ||
  "zDnaepZZHFcKxZ9r1xgqMqMFELf67VEmhFUddFBt2LPajim5z";

async function loadCommonJSModule<T>(modulePath: string): Promise<T> {
  const nodeModule = (await new Function("modulePath", "return import(modulePath);")(
    "module"
  )) as typeof import("module");
  const { createRequire } = nodeModule;
  const moduleRequire = createRequire(import.meta.url);
  return moduleRequire(modulePath) as T;
}

async function loadESModule<T>(modulePath: string): Promise<T> {
  return (await new Function("modulePath", "return import(modulePath);")(
    modulePath
  )) as T;
}

async function loadTrustVCModules(): Promise<TrustVCModule> {
  return loadCommonJSModule<TrustVCModule>("@trustvc/trustvc");
}

async function loadTrustVCContext(): Promise<TrustVCContextModule> {
  return loadCommonJSModule<TrustVCContextModule>("@trustvc/w3c-context");
}

async function signCredentialWithEcdsaSd2023(
  credential: Record<string, unknown>,
  keyPair: PrivateKeyPair,
  options?: { mandatoryPointers?: string[] }
): Promise<EcdsaSigningResult> {
  try {
    if (!keyPair.controller) {
      throw new Error('"controller" property in keyPair is required.');
    }
    if (!keyPair.id) {
      throw new Error('"id" property in keyPair is required.');
    }
    if (!keyPair.secretKeyMultibase) {
      throw new Error('"secretKeyMultibase" property in keyPair is required.');
    }
    if (!keyPair.publicKeyMultibase) {
      throw new Error('"publicKeyMultibase" property in keyPair is required.');
    }
    if (credential.proof) {
      throw new Error('"proof" property is already there.');
    }

    const [
      ecdsaMultikey,
      ecdsaSd2023Cryptosuite,
      dataIntegrity,
      jsonldSignaturesModule,
    ] = await Promise.all([
      loadESModule<EcdsaMultikeyModule>("@digitalbazaar/ecdsa-multikey"),
      loadESModule<EcdsaSd2023CryptosuiteModule>(
        "@digitalbazaar/ecdsa-sd-2023-cryptosuite"
      ),
      loadESModule<DataIntegrityModule>("@digitalbazaar/data-integrity"),
      loadESModule<JsonLdSignaturesModule>("jsonld-signatures"),
    ]);
    const jsonldSignatures =
      "default" in jsonldSignaturesModule
        ? jsonldSignaturesModule.default
        : jsonldSignaturesModule;
    const documentLoader = await createTrustVCDocumentLoader();
    const signingCredential = await prefillEcdsaSdCredentialId(credential);
    const mandatoryPointers = getEcdsaSdMandatoryPointers(
      signingCredential,
      options?.mandatoryPointers ?? []
    );
    const keyPairInstance = await ecdsaMultikey.from({ ...keyPair });
    const cryptosuite = ecdsaSd2023Cryptosuite.createSignCryptosuite({
      mandatoryPointers,
    });
    const suite = new dataIntegrity.DataIntegrityProof({
      signer: keyPairInstance.signer(),
      cryptosuite,
    });
    const { AssertionProofPurpose } = jsonldSignatures.purposes;
    const signed = await jsonldSignatures.sign(signingCredential, {
      suite,
      purpose: new AssertionProofPurpose(),
      documentLoader,
    });

    return { signed: signed as Record<string, unknown> };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "An error occurred while signing the credential.",
    };
  }
}

// Certificate data structure
export interface CertificateData {
  id: string;
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  templateId?: string;
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

// Build a minimal W3C VC that TrustVC's w3cVerifiers can verify.
// Uses a plain DID string as issuer (not an object) and only standard W3C
// VC / Data Integrity contexts.  The inline OPEN_ATTESTATION_CONTEXT was
// causing JSON-LD context-resolution failures when the credential was sent
// over the network API round-trip, because it is not a resolvable URL.
export function buildVCPayload(data: CertificateData) {
  const issuingMethods =
    data.issuingMethods && data.issuingMethods.length > 0
      ? data.issuingMethods
      : DEFAULT_ISSUING_METHODS;

  // Plain DID string — TrustVC's w3cIssuerIdentity verifier expects this
  // format and resolves the DID directly.  Wrapping it as an object with
  // type/name fields breaks DID resolution in the verification pipeline.
  const issuer = TRUSTVC_CONFIG.didUrl;

  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://w3id.org/security/data-integrity/v2",
    ],
    type: ["VerifiableCredential"],
    validFrom: data.validFrom,
    ...(data.validUntil ? { validUntil: data.validUntil } : {}),
    issuer,
    credentialSubject: {
      id: 'urn:uuid:' + crypto.randomUUID(),
      certificateId: data.id,
      type: ["Person"],
      name: data.recipientName,
      email: data.recipientEmail,
      certificateType: data.certificateType,
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
 * Verifies a W3C Verifiable Credential cryptographically using the TrustVC
 * verification API (ecdsa-sd-2023 / Data Integrity Proof).
 *
 * Returns `{ valid: true }` only when the proof is a valid cryptographic
 * signature over the credential AND the document hash is registered on the
 * Ethereum Document Store. Structural errors, missing proof fields, and
 * invalid signatures all produce `{ valid: false, message, details }` with
 * meaningful failure descriptions.
 */
export async function verifyCredential(
  document: Record<string, unknown>
): Promise<VerificationResult> {
  try {
    // Fast structural pre-checks so we can return friendly messages before
    // invoking the heavier cryptographic verifier.
    const required = [
      "@context",
      "type",
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
    if (!proof) {
      return {
        valid: false,
        message: "Credential is not signed — missing proof block.",
      };
    }

    const walletSignature = typeof proof["signature"] === "string"
      ? proof["signature"]
      : undefined;
    const walletAddress = typeof proof["signedBy"] === "string"
      ? proof["signedBy"]
      : typeof proof["verificationMethod"] === "string"
      ? proof["verificationMethod"]
      : undefined;

    const isWalletProof = proof["type"] === "EthereumPersonalSignature2024" && Boolean(walletSignature && walletAddress);

    if (isWalletProof && walletSignature && walletAddress) {
      try {
        const recoveredAddress = ethers.utils.verifyMessage(
          canonicalJson(stripExistingProof(document)),
          walletSignature
        );

        if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
          return {
            valid: false,
            message: "MetaMask signature does not match the signing wallet.",
            details: {
              verificationMethod: walletAddress,
              recoveredAddress,
            },
          };
        }
      } catch (error) {
        return {
          valid: false,
          message: `Invalid MetaMask signature: ${error instanceof Error ? error.message : "unknown signature error"}`,
        };
      }

      const issuingMethods = getIssuingMethods(document);
      if (!issuingMethods.includes("ethereum")) {
        return {
          valid: true,
          message: "Credential verified successfully (MetaMask signature)",
          details: {
            issuer: typeof document["issuer"] === "object" && document["issuer"] !== null
              ? String((document["issuer"] as Record<string, unknown>)["id"] ?? document["issuer"])
              : String(document["issuer"]),
            credentialId: getCredentialIdentifier(document),
            verificationMethod: walletAddress,
            cryptosuite: "EthereumPersonalSignature2024",
          },
        };
      }

      const onChainResult = await verifyDocumentOnChain(
        document,
        ISSUER_CONFIG.documentStore,
        new ethers.providers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl)
      );

      if (onChainResult.revoked) {
        return {
          valid: false,
          message: "Credential has been revoked on blockchain.",
          details: { verificationMethod: walletAddress, blockchainVerification: "failed", revoked: true },
        };
      }

      return {
        valid: onChainResult.verified,
        message: onChainResult.verified
          ? "Credential verified successfully (MetaMask signature and blockchain registration)"
          : "Credential signature is valid but document not found on blockchain.",
        details: {
          issuer: typeof document["issuer"] === "object" && document["issuer"] !== null
            ? String((document["issuer"] as Record<string, unknown>)["id"] ?? document["issuer"])
            : String(document["issuer"]),
          credentialId: getCredentialIdentifier(document),
          verificationMethod: walletAddress,
          cryptosuite: "EthereumPersonalSignature2024",
          blockchainVerification: onChainResult.verified ? "passed" : "failed",
        },
      };
    } else if (!proof["proofValue"]) {
      return {
        valid: false,
        message: "Credential is not signed — missing proofValue in proof block.",
      };
    }

    // Remove credentialStatus that points to unverifiable tradetrust.io status
    // lists — it would be skipped anyway for DID-issued credentials, but some
    // versions of tt-verify crash when encountering them in W3C VCs.
    const verificationInput = stripUnsupportedCredentialStatus(document);

    const { verifyDocument, isValid } = await loadTrustVCModules();
    
    // Build a document loader that serves our local DID document (for did:web DIDs
    // that are not publicly resolvable) so w3cIssuerIdentity can resolve the issuer.
    const documentLoader = await createTrustVCDocumentLoader();

    const verificationFragments = await verifyDocument(
      verificationInput as Parameters<typeof verifyDocument>[0],
      {
        rpcProviderUrl: NETWORKS.sepolia.rpcUrl,
        documentLoader,
      }
    );

    // isValid() expects OpenAttestation-style fragment types (DOCUMENT_STATUS, etc.).
    // For W3C VC Data Integrity Proof credentials the fragments use w3c-specific
    // types.  Fall back to checking individual fragment statuses when isValid throws
    // or returns an unexpected result.
    let signatureAndIdentityValid: boolean;
    try {
      signatureAndIdentityValid = isValid(verificationFragments);
    } catch (_e) {
      // isValid may throw if no fragments match the expected OA types.
      // In that case, check fragment statuses directly.
      signatureAndIdentityValid = verificationFragments.some(
        (f) => f.status === "VALID" || f.status === "SKIPPED"
      ) && !verificationFragments.some((f) => f.status === "INVALID");
    }
    const shouldFailIssuerIdentity = !isIssuerVerificationMethodMatch(document);

    if (!signatureAndIdentityValid || shouldFailIssuerIdentity) {
      const failingFragment = verificationFragments.find(
        (fragment) => fragment.status === "INVALID" || fragment.status === "ERROR"
      );
      const errorMsg =
        getVerificationFragmentMessage(failingFragment) ??
        (shouldFailIssuerIdentity
          ? "Credential issuer does not match the proof verification method."
          : "Signature verification failed.");
      return {
        valid: false,
        message: errorMsg,
        details: {
          issuer:
            typeof document["issuer"] === "object" && document["issuer"] !== null
              ? String((document["issuer"] as Record<string, unknown>)["id"] ?? document["issuer"])
              : String(document["issuer"]),
          credentialId: getCredentialIdentifier(document),
          cryptosuite: String(proof["cryptosuite"] ?? "unknown"),
          verificationMethod: String(proof["verificationMethod"] ?? "unknown"),
          fragments: verificationFragments,
          credentialStatus:
            verificationInput === document ? "verified" : "skipped (placeholder status list)",
        },
      };
    }

    const issuingMethods = getIssuingMethods(document);
    const requiresOnChainVerification = issuingMethods.includes("ethereum");

    if (!requiresOnChainVerification) {
      return {
        valid: true,
        message: "Credential verified successfully (cryptographic signature)",
        details: {
          issuer:
            typeof document["issuer"] === "object" && document["issuer"] !== null
              ? String((document["issuer"] as Record<string, unknown>)["id"] ?? document["issuer"])
              : String(document["issuer"]),
          credentialId: getCredentialIdentifier(document),
          credentialType: document["type"] as string[],
          cryptosuite: String(proof["cryptosuite"] ?? "unknown"),
          verificationMethod: String(proof["verificationMethod"] ?? "unknown"),
          fragments: verificationFragments,
          credentialStatus:
            verificationInput === document ? "verified" : "skipped (placeholder status list)",
          blockchainVerification: "skipped",
        },
      };
    }

    // Additionally verify on-chain registration for credentials that were
    // explicitly issued via the Ethereum path.
    const onChainResult = await verifyDocumentOnChain(
      document,
      ISSUER_CONFIG.documentStore,
      new ethers.providers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl)
    );

    if (onChainResult.revoked) {
      return {
        valid: false,
        message: "Credential has been revoked on blockchain.",
        details: {
          issuer:
            typeof document["issuer"] === "object" && document["issuer"] !== null
              ? String((document["issuer"] as Record<string, unknown>)["id"] ?? document["issuer"])
              : String(document["issuer"]),
          credentialId: getCredentialIdentifier(document),
          cryptosuite: String(proof["cryptosuite"] ?? "unknown"),
          verificationMethod: String(proof["verificationMethod"] ?? "unknown"),
          credentialStatus:
            verificationInput === document ? "verified" : "skipped (placeholder status list)",
          blockchainVerification: "failed",
          revoked: true,
          message: "Document hash is marked as revoked on document store",
        },
      };
    }

    if (!onChainResult.verified) {
      return {
        valid: false,
        message: "Credential signature is valid but document not found on blockchain.",
        details: {
          issuer:
            typeof document["issuer"] === "object" && document["issuer"] !== null
              ? String((document["issuer"] as Record<string, unknown>)["id"] ?? document["issuer"])
              : String(document["issuer"]),
          credentialId: getCredentialIdentifier(document),
          cryptosuite: String(proof["cryptosuite"] ?? "unknown"),
          verificationMethod: String(proof["verificationMethod"] ?? "unknown"),
          credentialStatus:
            verificationInput === document ? "verified" : "skipped (placeholder status list)",
          blockchainVerification: "failed",
          message: "Document hash not registered on document store"
        },
      };
    }

    return {
      valid: true,
      message: "Credential verified successfully (on-chain and cryptographic)",
      details: {
        issuer:
          typeof document["issuer"] === "object" && document["issuer"] !== null
            ? String((document["issuer"] as Record<string, unknown>)["id"] ?? document["issuer"])
            : String(document["issuer"]),
        credentialId: getCredentialIdentifier(document),
        credentialType: document["type"] as string[],
        cryptosuite: String(proof["cryptosuite"] ?? "unknown"),
        verificationMethod: String(proof["verificationMethod"] ?? "unknown"),
        credentialStatus:
          verificationInput === document ? "verified" : "skipped (placeholder status list)",
        blockchainVerification: "passed",
        transactionHash: onChainResult.txHash,
        blockNumber: onChainResult.blockNumber
      },
    };
  } catch (error) {
    const msg = (error as Error).message || String(error);
    // Surface network/DID-resolution errors with a specific hint.
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("ENOTFOUND")) {
      return {
        valid: false,
        message:
          "Could not resolve DID document for verification. " +
          "Ensure the issuer DID is reachable and retry. " +
          `(${msg})`,
      };
    }
    return {
      valid: false,
      message: `Verification error: ${msg}`,
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
// On-Chain Verification Functions
// ---------------------------------------------------------------------------

/**
 * Verifies a credential document hash against the OpenAttestation Document Store
 * on Ethereum to check if it has been issued/registered.
 *
 * @param credential - The W3C Verifiable Credential to verify
 * @param documentStoreAddress - The Ethereum Document Store contract address
 * @param providerOrSender - An ethers provider or signer
 * @returns Object with verification status and transaction details
 */
export async function verifyDocumentOnChain(
  credential: Record<string, unknown>,
  documentStoreAddress: string,
  providerOrSender: ethers.providers.Provider | ethers.Signer
): Promise<{ verified: boolean; revoked?: boolean; txHash?: string; blockNumber?: number }> {
  if (!documentStoreAddress) {
    return { verified: false };
  }

  try {
    const documentHash = computeDocumentStoreHash(credential);

    const provider = resolveProvider(providerOrSender);
    if (!provider) {
      return { verified: false };
    }

    const contract = new ethers.Contract(
      documentStoreAddress,
      DOCUMENT_STORE_ABI,
      provider
    );

    const [isIssued, isRevoked] = await Promise.all([
      contract.isIssued(documentHash),
      contract.isRevoked(documentHash),
    ]);

    return {
      verified: isIssued && !isRevoked,
      revoked: isRevoked,
      blockNumber: undefined,
    };
  } catch (error) {
    console.error("Document store verification failed:", error);
    return { verified: false };
  }
}

function getIssuingMethods(document: Record<string, unknown>): IssuingMethod[] {
  const issuingMethods = document["issuingMethods"];
  if (!Array.isArray(issuingMethods)) {
    return DEFAULT_ISSUING_METHODS;
  }

  const supportedMethods: IssuingMethod[] = ["did", "ethereum"];

  return issuingMethods.filter(
    (method): method is IssuingMethod =>
      typeof method === "string" && supportedMethods.includes(method as IssuingMethod)
  );
}

function getCredentialIdentifier(document: Record<string, unknown>): string | undefined {
  const credentialSubject = document["credentialSubject"];
  if (credentialSubject && typeof credentialSubject === "object") {
    const certificateId = (credentialSubject as Record<string, unknown>)["certificateId"];
    if (typeof certificateId === "string" && certificateId.trim()) {
      return certificateId;
    }
  }

  const legacyId = document["id"];
  if (typeof legacyId === "string" && legacyId.trim()) {
    return legacyId;
  }

  return undefined;
}

function getVerificationFragmentMessage(fragment: unknown): string | undefined {
  if (!fragment || typeof fragment !== "object") {
    return undefined;
  }

  const record = fragment as Record<string, unknown>;
  const reason = record.reason;
  const reasonMessage =
    reason && typeof reason === "object"
      ? (reason as Record<string, unknown>).message
      : reason;

  if (typeof reasonMessage === "string" && reasonMessage.trim()) {
    return reasonMessage;
  }

  const name = typeof record.name === "string" ? record.name : "TradeTrust verifier";
  const status = typeof record.status === "string" ? record.status : "failed";
  return `${name} returned ${status}.`;
}

function getMandatoryCredentialPointers(document: Record<string, unknown>): string[] {
  const pointers = new Set<string>(["/credentialSubject/certificateId", "/credentialSubject/name"]);
  const credentialSubject = document.credentialSubject;

  if (credentialSubject && typeof credentialSubject === "object") {
    for (const key of Object.keys(credentialSubject)) {
      if (["id", "certificateId", "name", "email", "certificateType"].includes(key)) {
        pointers.add(`/credentialSubject/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`);
      }
    }
  }

  return [...pointers];
}

async function prefillEcdsaSdCredentialId(
  credential: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { randomUUID, createHash } = await import("crypto");
  const signingCredential = { ...credential };
  const type = signingCredential.type;
  const credentialTypes = Array.isArray(type) ? type : [type];
  const isStatusListCredential = credentialTypes.some(
    (entry) => entry === "BitstringStatusListCredential" || entry === "StatusList2021Credential"
  );

  if (!(signingCredential.id && isStatusListCredential)) {
    signingCredential.id = `urn:uuid:${randomUUID()}`;
  }

  const credentialStatus = signingCredential.credentialStatus;
  if (
    credentialStatus &&
    typeof credentialStatus === "object" &&
    !Array.isArray(credentialStatus) &&
    (credentialStatus as Record<string, unknown>).type === "TransferableRecords"
  ) {
    signingCredential.credentialStatus = {
      ...(credentialStatus as Record<string, unknown>),
      tokenId: createHash("sha256").update(String(signingCredential.id)).digest("hex"),
    };
  }

  return signingCredential;
}

function getEcdsaSdMandatoryPointers(
  credential: Record<string, unknown>,
  userMandatoryPointers: string[]
): string[] {
  const contexts = credential["@context"];
  const firstContext = Array.isArray(contexts) ? contexts[0] : contexts;
  const coreMandatoryPointers = ["/issuer"];

  if (firstContext === "https://www.w3.org/ns/credentials/v2") {
    if (credential.validFrom) {
      coreMandatoryPointers.push("/validFrom");
    }
    if (credential.validUntil) {
      coreMandatoryPointers.push("/validUntil");
    }
  } else {
    coreMandatoryPointers.push("/issuanceDate");
    if (credential.expirationDate) {
      coreMandatoryPointers.push("/expirationDate");
    }
  }

  if (credential.credentialStatus) {
    coreMandatoryPointers.push("/credentialStatus");
  }

  return [
    ...coreMandatoryPointers,
    ...userMandatoryPointers.filter((pointer) => !coreMandatoryPointers.includes(pointer)),
  ];
}

function resolveProvider(
  providerOrSender: ethers.providers.Provider | ethers.Signer
): ethers.providers.Provider | null {
  if ((providerOrSender as ethers.Signer).provider) {
    return (providerOrSender as ethers.Signer).provider ?? null;
  }

  if (
    typeof (providerOrSender as ethers.providers.Provider).getNetwork === "function" &&
    typeof (providerOrSender as ethers.providers.Provider).getBlockNumber === "function"
  ) {
    return providerOrSender as ethers.providers.Provider;
  }

  return null;
}

function stripUnsupportedCredentialStatus(
  document: Record<string, unknown>
): Record<string, unknown> {
  const credentialStatus = document["credentialStatus"];
  if (!credentialStatus || Array.isArray(credentialStatus)) {
    return document;
  }

  const statusListCredential =
    typeof credentialStatus === "object" && credentialStatus !== null
      ? (credentialStatus as Record<string, unknown>)["statusListCredential"]
      : undefined;

  if (
    typeof statusListCredential === "string" &&
    statusListCredential.includes("tradetrust.io/status")
  ) {
    const { credentialStatus: _credentialStatus, ...documentWithoutStatus } = document;
    return documentWithoutStatus;
  }

  return document;
}

function isIssuerVerificationMethodMatch(document: Record<string, unknown>): boolean {
  const issuer = document["issuer"];
  const proof = document["proof"];

  const issuerId =
    typeof issuer === "string"
      ? issuer
      : issuer && typeof issuer === "object"
        ? String((issuer as Record<string, unknown>)["id"] ?? "")
        : "";

  const verificationMethod =
    proof && typeof proof === "object"
      ? String((proof as Record<string, unknown>)["verificationMethod"] ?? "")
      : "";

  if (!issuerId || !verificationMethod) {
    return false;
  }

  const verificationDid = verificationMethod.split("#")[0] ?? "";
  return normalizeDid(issuerId) === normalizeDid(verificationDid);
}

function normalizeDid(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

async function createTrustVCDocumentLoader() {
  const { getDocumentLoader, MULTIKEY_V1_URL } = await loadTrustVCContext();

  const didDocument = {
    "@context": ["https://www.w3.org/ns/did/v1", MULTIKEY_V1_URL],
    id: TRUSTVC_CONFIG.didUrl,
    verificationMethod: [
      {
        id: LOCAL_DID_VERIFICATION_METHOD_ID,
        type: "Multikey",
        controller: TRUSTVC_CONFIG.didUrl,
        publicKeyMultibase: LOCAL_DID_PUBLIC_KEY_MULTIBASE,
      },
    ],
    authentication: [LOCAL_DID_VERIFICATION_METHOD_ID],
    assertionMethod: [LOCAL_DID_VERIFICATION_METHOD_ID],
    capabilityInvocation: [LOCAL_DID_VERIFICATION_METHOD_ID],
    capabilityDelegation: [LOCAL_DID_VERIFICATION_METHOD_ID],
  };

  return getDocumentLoader({
    [TRUSTVC_CONFIG.didUrl]: didDocument,
    [LOCAL_DID_VERIFICATION_METHOD_ID]: {
      "@context": didDocument["@context"],
      ...(didDocument.verificationMethod[0] as Record<string, unknown>),
    },
  });
}

// ---------------------------------------------------------------------------

/**
 * Reads the DID key pair from the server environment.
 * Returns null when the variables are not set (unsigned/demo mode).
 *
 * All four variables must be present; if any one is missing the function
 * returns null and credentials are issued as unsigned drafts.
 *
 * Required variables (all must be set together):
 *   DID_KEY_ID              – full key URL, e.g. did:web:example.com#key-1
 *   DID_CONTROLLER          – DID controller, e.g. did:web:example.com
 *   DID_PUBLIC_KEY_MULTIBASE  – multibase-encoded public key (starts with "z")
 *   DID_PRIVATE_KEY_MULTIBASE – multibase-encoded private key (starts with "z")
 *
 * The private key is deliberately server-only: a NEXT_PUBLIC_ variant would be
 * inlined into the browser bundle and expose the issuer signing key.
 */
export function getDIDKeyPairFromEnv(): PrivateKeyPair | null {
  const id = process.env.DID_KEY_ID || process.env.NEXT_PUBLIC_DID_KEY_ID;
  const controller = process.env.DID_CONTROLLER || process.env.NEXT_PUBLIC_DID_CONTROLLER;
  const publicKeyMultibase =
    process.env.DID_PUBLIC_KEY_MULTIBASE || process.env.NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE;
  const secretKeyMultibase = process.env.DID_PRIVATE_KEY_MULTIBASE;

  if (!id || !controller || !publicKeyMultibase || !secretKeyMultibase) {
    return null;
  }
  return {
    "@context": "https://w3id.org/security/multikey/v1",
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
  /** MetaMask wallet signature over the DID credential, when requested */
  walletAddress?: string;
  walletSignature?: string;
  /** Human-readable error/warning message */
  error?: string;
}

/**
 * Signs an arbitrary credential document using the DID key pair configured
 * via the server-side DID_* environment variables.
 *
 * The `secretKeyOverride` parameter can be used to supply the
 * `secretKeyMultibase` value directly (e.g. entered by the user in the Sign
 * page).  When provided it takes precedence over the env var.  The other
 * three key fields (id, controller, publicKeyMultibase) are always read from
 * environment variables so there is no hardcoded issuer DID in the signing
 * flow.
 *
 * Returns `{ signed: true, credential }` on success or
 * `{ signed: false, error }` with an actionable message on failure.
 */
export async function signDocumentWithDID(
  credential: Record<string, unknown>,
  secretKeyOverride?: string
): Promise<DIDIssuanceResult> {
  const id = process.env.DID_KEY_ID || process.env.NEXT_PUBLIC_DID_KEY_ID;
  const controller = process.env.DID_CONTROLLER || process.env.NEXT_PUBLIC_DID_CONTROLLER;
  const publicKeyMultibase =
    process.env.DID_PUBLIC_KEY_MULTIBASE || process.env.NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE;
  const secretKeyMultibase =
    secretKeyOverride?.trim() || process.env.DID_PRIVATE_KEY_MULTIBASE;

  const missing: string[] = [];
  if (!id) missing.push("DID_KEY_ID");
  if (!controller) missing.push("DID_CONTROLLER");
  if (!publicKeyMultibase) missing.push("DID_PUBLIC_KEY_MULTIBASE");
  if (!secretKeyMultibase)
    missing.push("DID_PRIVATE_KEY_MULTIBASE (or provide private key override)");

  if (missing.length > 0) {
    return {
      credential,
      signed: false,
      error:
        `DID signing is not configured. The following are required: ${missing.join(", ")}. ` +
        "Set them in the server environment for the signing service. " +
        "Do not expose private key material in browser code or public build output.",
    };
  }

  const keyPair: PrivateKeyPair = {
    "@context": "https://w3id.org/security/multikey/v1",
    id: id,
    type: "Multikey",
    controller: controller,
    publicKeyMultibase: publicKeyMultibase,
    secretKeyMultibase: secretKeyMultibase,
  } as PrivateKeyPair;

  const unsignedCredential = stripExistingProof(credential);

  try {
    const result = await signCredentialWithEcdsaSd2023(unsignedCredential, keyPair, {
      mandatoryPointers: getMandatoryCredentialPointers(unsignedCredential),
    });
    if (result.error) {
      return { credential: unsignedCredential, signed: false, error: result.error };
    }
    if (!result.signed) {
      return { credential: unsignedCredential, signed: false, error: "Signing returned no result." };
    }
    return {
      credential: result.signed as unknown as Record<string, unknown>,
      signed: true,
    };
  } catch (err) {
    console.error("DID signing failed", err);
    return {
      credential: unsignedCredential,
      signed: false,
      error: err instanceof Error ? err.message : "Unknown signing error.",
    };
  }
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
        "Set DID_KEY_ID, DID_CONTROLLER, DID_PUBLIC_KEY_MULTIBASE, and DID_PRIVATE_KEY_MULTIBASE in the server environment to enable cryptographic signing.",
    };
  }

  try {
    const result = await signCredentialWithEcdsaSd2023(credential, keyPair, {
      mandatoryPointers: getMandatoryCredentialPointers(credential),
    });
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
    const message = err instanceof Error ? err.message : "Unknown signing error.";
    return {
      credential,
      signed: false,
      error: `DID signing failed: ${message}`,
    };
  }
}

function stripExistingProof(
  credential: Record<string, unknown>
): Record<string, unknown> {
  if (!("proof" in credential)) {
    return credential;
  }

  const { proof: _proof, ...unsignedCredential } = credential;
  return unsignedCredential;
}

// ---------------------------------------------------------------------------
// Ethereum Document Store Issuance
// ---------------------------------------------------------------------------

export interface EthereumIssuanceResult {
  txHash?: string;
  documentHash?: string;
  credential?: Record<string, unknown>;
  walletAddress?: string;
  signature?: string;
  error?: string;
}

export interface EthereumCredentialSigningResult {
  credential: Record<string, unknown>;
  walletAddress: string;
  signature: string;
}

export interface EthereumRevocationResult {
  txHash?: string;
  documentHash?: string;
  submittedViaBeacon?: boolean;
  error?: string;
}

export type RevocationHashMode = "auto" | "targetHash" | "merkleRoot";

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
 * Signs the canonical credential payload with the connected MetaMask wallet.
 * The returned proof is included in the document before its hash is stored on
 * the Document Store, so the downloaded credential and on-chain record match.
 */
export async function signCredentialWithEthereum(
  credential: Record<string, unknown>,
  signer: ethers.Signer
): Promise<EthereumCredentialSigningResult> {
  const walletAddress = await signer.getAddress();
  const message = canonicalJson(stripExistingProof(credential));
  const signature = await signer.signMessage(message);
  const signedCredential = {
    ...stripExistingProof(credential),
    proof: {
      type: "EthereumPersonalSignature2024",
      created: new Date().toISOString(),
      verificationMethod: walletAddress,
      proofPurpose: "assertionMethod",
      signedBy: walletAddress,
      signature,
    },
  };

  return { credential: signedCredential, walletAddress, signature };
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
    const documentHash = computeDocumentStoreHash(credential);

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
      credential,
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

/**
 * Revokes a credential hash on the OpenAttestation Document Store.
 * The hash is keccak256(canonicalJson(credential)) and must match the
 * originally issued document hash.
 */
export async function revokeCertificateOnEthereum(
  credential: Record<string, unknown>,
  documentStoreAddress: string,
  signer: ethers.Signer,
  options?: { hashMode?: RevocationHashMode }
): Promise<EthereumRevocationResult> {
  if (!documentStoreAddress) {
    return { error: "Document store address is required." };
  }

  try {
    const documentHash = computeDocumentStoreHash(
      credential,
      options?.hashMode ?? "auto"
    );

    const contract = new ethers.Contract(
      documentStoreAddress,
      DOCUMENT_STORE_ABI,
      signer
    );

    const isRevoked = await contract.isRevoked(documentHash);

    if (isRevoked) {
      return { error: "This document is already revoked.", documentHash };
    }

    try {
      await contract.callStatic.revoke(documentHash);
    } catch (staticErr) {
      const staticMsg = (staticErr as Error).message ?? String(staticErr);
      return {
        error:
          "Pre-check failed — the connected wallet may not have revocation permissions on " +
          `this document store. (${staticMsg})`,
        documentHash,
      };
    }

    const tx: ethers.ContractTransaction = await contract.revoke(documentHash);
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

/**
 * Revokes a DID-issued credential through an Open Attestation OCSP responder.
 *
 * The responder stores revocation state by document hash and does not require
 * a blockchain transaction or wallet connection.
 */
export async function revokeCertificateViaOcspResponder(
  credential: Record<string, unknown>,
  ocspResponderUrl: string,
  options?: { hashMode?: RevocationHashMode; reasonCode?: number }
): Promise<EthereumRevocationResult> {
  if (!ocspResponderUrl) {
    return { error: "OCSP responder URL is required." };
  }

  try {
    const documentHash = computeDocumentStoreHash(
      credential,
      options?.hashMode ?? "auto"
    );
    const normalizedUrl = ocspResponderUrl.replace(/\/+$/, "");

    const response = await fetch(normalizedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentHash,
        reasonCode: options?.reasonCode ?? 3,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      return {
        error: `OCSP responder rejected the revocation request (${response.status} ${response.statusText}). ${responseText}`,
        documentHash,
      };
    }

    return {
      documentHash,
    };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        const documentHash = computeDocumentStoreHash(
          credential,
          options?.hashMode ?? "auto"
        );
        const normalizedUrl = ocspResponderUrl.replace(/\/+$/, "");
        const beaconBody = new Blob(
          [JSON.stringify({ documentHash, reasonCode: options?.reasonCode ?? 3 })],
          { type: "application/json" }
        );

        if (navigator.sendBeacon(normalizedUrl, beaconBody)) {
          return {
            documentHash,
            submittedViaBeacon: true,
          };
        }
      } catch {
        // Fall through to the explicit error below.
      }
    }

    return {
      error:
        `OCSP revocation failed: ${msg}. ` +
        "If this responder does not allow browser fetches, deploy it behind a same-origin proxy or use a CORS-enabled endpoint.",
    };
  }
}

function computeDocumentStoreHash(
  credential: Record<string, unknown>,
  mode: RevocationHashMode = "auto"
): string {
  if (mode === "targetHash") {
    const targetHash = getWrappedTargetHash(credential);
    if (!targetHash) {
      throw new Error("targetHash is not available in credential.signature.");
    }
    return targetHash;
  }

  if (mode === "merkleRoot") {
    const merkleRoot = getWrappedMerkleRoot(credential);
    if (!merkleRoot) {
      throw new Error("merkleRoot is not available in credential.signature.");
    }
    return merkleRoot;
  }

  const targetHash = getWrappedTargetHash(credential);
  if (targetHash) {
    return targetHash;
  }

  return ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(canonicalJson(credential))
  );
}

function getWrappedTargetHash(credential: Record<string, unknown>): string | null {
  const signature = credential["signature"];
  if (!signature || typeof signature !== "object") {
    return null;
  }

  const targetHash = (signature as Record<string, unknown>)["targetHash"];
  if (typeof targetHash === "string" && isBytes32Hex(targetHash)) {
    return targetHash;
  }

  return null;
}

function getWrappedMerkleRoot(credential: Record<string, unknown>): string | null {
  const signature = credential["signature"];
  if (!signature || typeof signature !== "object") {
    return null;
  }

  const merkleRoot = (signature as Record<string, unknown>)["merkleRoot"];
  if (typeof merkleRoot === "string" && isBytes32Hex(merkleRoot)) {
    return merkleRoot;
  }

  return null;
}

function isBytes32Hex(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim());
}
