// TrustVC SDK Integration for Certificate Issuance
// Uses @trustvc/trustvc for W3C Verifiable Credentials.
// The TrustVC crypto SDK is imported lazily so the browser bundle does not
// pull in Node-only dependencies or expose signing keys to the client.
import bs58 from "bs58";
import {
  Contract,
  formatEther,
  isAddress,
  JsonRpcProvider,
  keccak256,
  Provider,
  Signer,
  toUtf8Bytes,
  verifyMessage,
} from "ethers";
import { resolvePublicKeyMultibase } from "./did-utils";

import {
  CERTIFICATE_TEMPLATES,
  DEFAULT_ISSUING_METHODS,
  IssuingMethod,
  OPENCERTS_CONTEXT,
  OPENCERTS_SCHEMA_V2_CONTEXT,
  OPEN_CERTS_SUBJECT_FIELD_MAP,
  TRUSTVC_CONFIG,
  DOCUMENT_STORE_CONFIG,
  ISSUER_CONFIG,
  NETWORKS,
  OPENCERTS_CREDENTIAL_TYPE,
  OPENCERTS_SUBJECT_TYPE,
  OPENCERTS_EXTRA_CONTEXTS,
  OPENTRUST_DSS_CONTEXT,
  COMPROBANTE_CONTEXT,
} from "./constants";

/** Credential output mode — `undefined` defaults to standard W3C VC. */
export type CertificateMode = "standard" | "opencerts" | "v1" | "w3c";

type TrustVCContextModule = typeof import("@trustvc/w3c-context");
type DocumentLoader = import("@trustvc/w3c-context").DocumentLoader;

type W3CVerificationModule = {
  isDerived(document: Record<string, unknown>): Promise<boolean>;
  deriveCredential(
    document: Record<string, unknown>,
    pointers: string[],
    options: { documentLoader: DocumentLoader }
  ): Promise<{ derived?: Record<string, unknown>; error?: string }>;
  verifyCredential(
    document: Record<string, unknown>,
    options: { documentLoader: DocumentLoader }
  ): Promise<{ verified: boolean; error?: string }>;
};

// Normalise any accepted format string into the internal CredentialMode used by buildVCPayload.
const MODE_ALIASES: Readonly<Record<string, CertificateMode>> = Object.freeze({
  standard: "standard",
  opencerts: "opencerts",
  v1: "standard",
  w3c: "opencerts",
});

function resolveCertificateMode(raw?: string): CertificateMode {
  return raw && raw in MODE_ALIASES ? MODE_ALIASES[raw] : "standard";
}

// Runtime type for @trustvc/trustvc verifyDocument output (fragments).
// The package's .d.ts files are empty, so we define our own based on actual runtime usage.
interface VerificationFragment {
  name: string;
  status: "VALID" | "INVALID" | "SKIPPED" | "ERROR";
  message?: string;
}

type VerifyDocumentFn = (
  document: Record<string, unknown>,
  options: { rpcProviderUrl: string; documentLoader: (url: string) => Promise<{ document: string; contextUrl: string | null }> }
) => Promise<VerificationFragment[]>;

type IsValidFn = (fragments: VerificationFragment[]) => boolean;

type TrustVCModule = {
  verifyDocument: (
    document: Record<string, unknown>,
    options: { rpcProviderUrl: string; documentLoader: (url: string) => Promise<{ document: unknown; contextUrl: string | null }> }
  ) => Promise<VerificationFragment[]>;
  isValid: (fragments: VerificationFragment[]) => boolean;
};

interface PrivateKeyPair {
  "@context"?: string;
  id: string;
  type: "Multikey";
  controller: string;
  publicKeyMultibase: string;
  secretKeyMultibase: string;
}

type EcdsaSigningResult = {
  signed?: Record<string, unknown>;
  error?: string;
};

type EcdsaMultikeyModule = {
  from(keyPair: Record<string, unknown>): Promise<{
    signer(): unknown;
    export(options: { publicKey: true }): Promise<{ publicKeyMultibase: string }>;
  }>;
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

// Inline (embedded) JSON-LD term definitions for the credentialSubject fields
// this issuer emits. These terms have no definition in the W3C VC v2 or Data
// Integrity contexts, so without them jsonld expands them to relative IRIs and
// the ecdsa-sd-2023 canonicalization step aborts with
// "Safe mode validation error." (jsonld event code: "invalid property").
//
// The object is embedded directly in "@context" rather than referenced by URL,
// so no network fetch or context resolution is required at sign or verify time.
const CERTIFICATE_SUBJECT_CONTEXT = {
  "@version": 1.1,
  // Maps the remaining schema.org terms this issuer uses — name, email,
  // description and the "Person" subject type.
  "@vocab": "https://schema.org/",
  certificateId: "https://schemas.tradetrust.io/credentials#certificateId",
  certificateType: "https://schemas.tradetrust.io/credentials#certificateType",
  templateId: "https://schemas.tradetrust.io/credentials#templateId",
  issuerDisplayName: "https://verifiable.sg/credentials#issuerDisplayName",
} as const;

const LOCAL_DID_VERIFICATION_METHOD_ID = `${TRUSTVC_CONFIG.didUrl}#key-1`;
// Convert hex-encoded public key (0x || x32 || y32) to Base58 multibase for trustvc compatibility.
function hexPubKeyToMultibase(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = Buffer.from(clean, "hex");
  return `z${bs58.encode(bytes).toString()}`;
}

// Resolve the public key multibase from env vars, supporting both:
//   • Base58 z-prefixed multibase (W3C Multikey format)
//   • Hex-encoded uncompressed secp256k1 point (0x || x || y)
let LOCAL_DID_PUBLIC_KEY_MULTIBASE = resolvePublicKeyMultibase();

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

export async function getTrustVCContextUrls(): Promise<ReadonlySet<string>> {
  const contextModule = await loadTrustVCContext();
  const urls = new Set<string>();
  for (const value of Object.values(contextModule)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const key of Object.keys(value)) {
      if (key.startsWith("https://")) urls.add(key);
    }
  }
  return urls;
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
    const signingCredential = injectTargetHash(
      await prefillEcdsaSdCredentialId(credential)
    );
    const mandatoryPointers = getEcdsaSdMandatoryPointers(
      signingCredential,
      options?.mandatoryPointers ?? []
    );
    let keyPairInstance: Awaited<ReturnType<EcdsaMultikeyModule["from"]>>;
    try {
      keyPairInstance = await ecdsaMultikey.from({ ...keyPair });
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid keyData") {
        throw new Error("DID private key does not match its configured public key.");
      }
      throw error;
    }
    const derivedPublicKey = await keyPairInstance.export({ publicKey: true });
    if (derivedPublicKey.publicKeyMultibase !== keyPair.publicKeyMultibase) {
      throw new Error("DID private key does not match its configured public key.");
    }
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
    const proof =
      credential.proof && typeof credential.proof === "object"
        ? (credential.proof as Record<string, unknown>)
        : undefined;
    const validationResult = {
      error: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
    };
    const credentialType = credential.type;
    const issuer = credential.issuer;
    const proofType = proof?.type;
    const verificationMethod =
      typeof proof?.verificationMethod === "string"
        ? proof.verificationMethod
        : keyPair.id;

    console.error("[safe-mode]", {
      validationResult,
      credentialType,
      issuer,
      proofType,
      verificationMethod,
    });

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
  issuerDid?: string;
  issuerDisplayName?: string;
  documentStoreAddress?: string;
  documentStoreNetwork?: string;
  issueDate: string;
  description: string;
  validFrom: string;
  validUntil?: string;
  issuingMethods?: IssuingMethod[];
  certificateFormat?: CertificateMode;
}

// Generate a UUID for certificate
export function generateCertificateId(): string {
  return `urn:uuid:${crypto.randomUUID()}`;
}

// Build a minimal W3C VC that TrustVC's w3cVerifiers can verify.
// Uses a plain DID string as issuer (not an object) and only standard W3C
// VC / Data Integrity contexts, plus an embedded term definition object for
// the issuer-specific credentialSubject fields.  The embedded context is
// required: without it jsonld safe mode rejects the undefined terms during
// ecdsa-sd-2023 canonicalization.  It is inlined rather than referenced by
// URL so no context resolution over the network is needed.
// Map internal certificate data to OpenCerts credential subject standard fields
export function toOpenCertsCredentialSubject(
  data: CertificateData
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const idPrefix = "urn:uuid:";

  // Generate a unique subject identifier (required by OpenCerts for RDFa/JSON-LD identity).
  // This is the credentialSubject's JSON-LD @id — distinct from certificate numbers.
  result["id"] = idPrefix + crypto.randomUUID();

  // Set subject type — the inline context has "@vocab": "https://schema.org/" so this
  // resolves to "https://schema.org/Person" which is what OpenCerts renderer pipelines expect.
  result["@type"] = "Person";

  // Map data fields to canonical OpenCerts names using the constant as source of truth.
  if (data.id) result[OPEN_CERTS_SUBJECT_FIELD_MAP.certificateId] = data.id;
  if (data.recipientName) result[OPEN_CERTS_SUBJECT_FIELD_MAP.recipientName] = data.recipientName;
  if (data.recipientEmail) result[OPEN_CERTS_SUBJECT_FIELD_MAP.recipientEmail] = data.recipientEmail;
  if (data.certificateType) result[OPEN_CERTS_SUBJECT_FIELD_MAP.certificateType] = data.certificateType;
  if (data.templateId) result[OPEN_CERTS_SUBJECT_FIELD_MAP.templateId] = data.templateId;
  if (data.description) result[OPEN_CERTS_SUBJECT_FIELD_MAP.description] = data.description;
  if (data.issuerDisplayName) result.issuerDisplayName = data.issuerDisplayName;

  return result;
}

// Determine the $template value for a given certificate type
function getTemplateForCertificateType(
  certType: string | undefined
): { name: string; type: string; url: string; version?: string } | undefined {
  if (!certType) return undefined;
  const key = Object.keys(CERTIFICATE_TEMPLATES).find(
    (k) => k.toLowerCase().replace(/[-_]/g, "") === certType.toLowerCase().replace(/[-_]/g, "")
  );
  return key ? CERTIFICATE_TEMPLATES[key as keyof typeof CERTIFICATE_TEMPLATES].template : undefined;
}

export function buildVCPayload(data: CertificateData, mode?: string) {
  const resolved = resolveCertificateMode(mode);
  const issuingMethods =
    data.issuingMethods && data.issuingMethods.length > 0
      ? data.issuingMethods
      : DEFAULT_ISSUING_METHODS;

  // Plain DID string — TrustVC's w3cIssuerIdentity verifier expects this
  // format and resolves the DID directly.  Wrapping it as an object with
  // type/name fields breaks DID resolution in the verification pipeline.
  const issuer = data.issuerDid ?? TRUSTVC_CONFIG.didUrl;

  // Build credential subject using canonical OpenCerts field mapping
  let subject: Record<string, unknown> = toOpenCertsCredentialSubject(data);

  // Determine $template from certificate type for verifier-side template resolution
  const issuedTemplate = getTemplateForCertificateType(data.certificateType);

  // ─── OA / OpenCerts mode adjustments (additive; standard mode unchanged) ───
  if (resolved === "opencerts") {
    // credentialStatus becomes an array element with _type for OA recognition
    subject = { ...subject, _type: OPENCERTS_SUBJECT_TYPE };
  }

  const baseContexts = [
    "https://www.w3.org/ns/credentials/v2",
    "https://w3id.org/security/data-integrity/v2",
    OPENCERTS_CONTEXT,
    // Inline equivalent of `https://schema.openattestation.com/definitions/schema-openattestation-v2.json`
    OPENCERTS_SCHEMA_V2_CONTEXT,
    CERTIFICATE_SUBJECT_CONTEXT,
  ];

  const baseType = ["VerifiableCredential"];

  return {
    "@context": resolved === "opencerts"
      ? [...baseContexts, ...OPENCERTS_EXTRA_CONTEXTS, OPENTRUST_DSS_CONTEXT, COMPROBANTE_CONTEXT]
      : baseContexts,
    type: resolved === "opencerts"
      ? [...baseType, OPENCERTS_CREDENTIAL_TYPE]
      : baseType,
    validFrom: data.validFrom,
    ...(data.validUntil ? { validUntil: data.validUntil } : {}),
    issuer,
    credentialSubject: {
      ...subject,
      ...(issuedTemplate
        ? {
            $template: issuedTemplate.name,
            $templateVersion: issuedTemplate.version ?? "2.0.0",
          }
        : {}),
    },
    // Application-specific store reference, not a supported TrustVC W3C
    // status-list entry or an OpenAttestation wrapper. See the compatibility reports.
    credentialStatus: [
      {
        id: `did:ethr:${data.documentStoreNetwork === "mainnet" ? "mainnet:" : ""}${data.documentStoreAddress ?? DOCUMENT_STORE_CONFIG.address}#${data.id}`,
        type: "OpenAttestationDocumentStore",
        documentId: data.id,
        revocation: TRUSTVC_CONFIG.revocation,
      },
    ],
    issuingMethods,
  };
}

export const RENDER_METHOD_CONTEXT_V2_URL = "https://trustvc.io/context/render-method-context-v2.json";
// Must be the final served origin: hosts derive the penpal child origin from this URL,
// and the apex domain redirects to www, which would time out the handshake.
export const EMBEDDED_RENDERER_URL = "https://www.verifiable.sg/renderer/";

/**
 * Adds a TradeTrust/OpenCerts embedded-renderer `renderMethod` to an unsigned
 * credential. It must be applied before signing; signing makes it mandatory.
 */
export function withEmbeddedRenderMethod(
  credential: Record<string, unknown>,
  templateName: string
): Record<string, unknown> {
  if ("proof" in credential) {
    throw new Error("renderMethod must be added before the credential is signed.");
  }
  if (!/^[a-z0-9-]+$/.test(templateName)) {
    throw new Error("Unsupported renderer template name.");
  }
  const contexts = credential["@context"];
  const contextList = Array.isArray(contexts) ? contexts : contexts === undefined ? [] : [contexts];
  return {
    ...credential,
    "@context": contextList.includes(RENDER_METHOD_CONTEXT_V2_URL)
      ? contextList
      : [...contextList, RENDER_METHOD_CONTEXT_V2_URL],
    renderMethod: [{ id: EMBEDDED_RENDERER_URL, type: "EMBEDDED_RENDERER", templateName }],
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
 * Verifies supported credentials without rewriting their signed contents.
 *
 * ECDSA selective-disclosure proofs resolve public issuer authorization and fail
 * explicitly when status cannot be checked. Wallet and legacy proof handling
 * retain their existing behavior. Ethereum issuance also requires registration.
 */
export async function verifyCredential(
  document: Record<string, unknown>,
  options: { documentLoader?: DocumentLoader; documentStoreProvider?: Provider } = {}
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
        const recoveredAddress = verifyMessage(
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
        new JsonRpcProvider(NETWORKS.sepolia.rpcUrl)
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

    if (proof["type"] === "DataIntegrityProof" && proof["cryptosuite"] === "ecdsa-sd-2023") {
      const documentLoader = options.documentLoader ?? await createTrustVCDocumentLoader();
      return await verifyEcdsaCredential(document, proof, documentLoader, options.documentStoreProvider);
    }

    // Remove credentialStatus that points to unverifiable tradetrust.io status
    // lists — it would be skipped anyway for DID-issued credentials, but some
    // versions of tt-verify crash when encountering them in W3C VCs.
    const verificationInput = stripUnsupportedCredentialStatus(document);

    const { verifyDocument, isValid } = await loadTrustVCModules();
    
    // Build a document loader that serves our local DID document (for did:web DIDs
    // that are not publicly resolvable) so w3cIssuerIdentity can resolve the issuer.
    const documentLoader = options.documentLoader ?? await createTrustVCDocumentLoader();

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
      new JsonRpcProvider(NETWORKS.sepolia.rpcUrl)
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
  providerOrSender: Provider | Signer
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

    const contract = new Contract(
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
  if (Array.isArray(document.type) && document.type.includes("BitstringStatusListCredential")) {
    return ["/id", "/type", "/credentialSubject"];
  }
  const pointers = new Set<string>(["/credentialSubject/certificateId", "/credentialSubject/name"]);
  // External hosts select the renderer from this field, so it must survive derivation.
  if (document.renderMethod !== undefined) pointers.add("/renderMethod");
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
  providerOrSender: Provider | Signer
): Provider | null {
  if ((providerOrSender as Signer).provider) {
    return (providerOrSender as Signer).provider ?? null;
  }

  if (
    typeof (providerOrSender as Provider).getNetwork === "function" &&
    typeof (providerOrSender as Provider).getBlockNumber === "function"
  ) {
    return providerOrSender as Provider;
  }

  return null;
}

async function verifyEcdsaCredential(
  document: Record<string, unknown>,
  proof: Record<string, unknown>,
  documentLoader: DocumentLoader,
  documentStoreProvider?: Provider
): Promise<VerificationResult> {
  const issuer = typeof document.issuer === "string" ? document.issuer :
    isRecord(document.issuer) ? document.issuer.id : undefined;
  const methodId = proof.verificationMethod;
  if (typeof issuer !== "string" || typeof methodId !== "string" ||
      methodId.split("#")[0] !== issuer || proof.proofPurpose !== "assertionMethod") {
    return { valid: false, message: "Credential issuer does not match an assertion proof verification method." };
  }
  const resolved = (await documentLoader(issuer)).document;
  if (!isRecord(resolved) || resolved.id !== issuer) {
    return { valid: false, message: "Resolved DID document does not match the credential issuer." };
  }
  const assertions = Array.isArray(resolved.assertionMethod) ? resolved.assertionMethod : [];
  const authorized = assertions.some((entry: unknown) =>
    entry === methodId || (isRecord(entry) && entry.id === methodId));
  const methods = [
    ...(Array.isArray(resolved.verificationMethod) ? resolved.verificationMethod : []),
    ...assertions.filter(isRecord),
  ];
  const method = methods.find((entry: unknown) => isRecord(entry) && entry.id === methodId);
  if (!authorized || !isRecord(method) || method.controller !== issuer) {
    return { valid: false, message: "Proof verification method is not authorized by the issuer DID assertionMethod." };
  }
  // Pin the method to the issuer document just resolved, not a separate key URL.
  const pinnedLoader: DocumentLoader = async (url) => {
    if (url === issuer) return { document: resolved, contextUrl: null, documentUrl: issuer };
    if (url === methodId) {
      return {
        document: {
          ...method,
          id: methodId,
          "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/multikey/v1",
            "https://w3id.org/security/suites/jws-2020/v1",
          ],
        },
        contextUrl: null,
        documentUrl: methodId,
      };
    }
    return documentLoader(url);
  };
  const sdk = await loadCommonJSModule<W3CVerificationModule>("@trustvc/w3c-vc");
  const input = structuredClone(document);
  let verificationInput = input;
  if (!await sdk.isDerived(input)) {
    const pointers = Object.keys(input)
      .filter((key) => key !== "@context" && key !== "proof")
      .map((key) => `/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`);
    const disclosure = await sdk.deriveCredential(input, pointers, { documentLoader: pinnedLoader });
    if (!disclosure.derived) {
      return { valid: false, message: disclosure.error ?? "Unable to derive credential for verification." };
    }
    verificationInput = disclosure.derived;
  }
  const verification = await sdk.verifyCredential(verificationInput, { documentLoader: pinnedLoader });
  if (!verification.verified) {
    return { valid: false, message: verification.error ?? "Credential signature verification failed." };
  }
  const now = Date.now();
  for (const [field, future] of [["validFrom", true], ["validUntil", false]] as const) {
    const value = document[field];
    if (value !== undefined) {
      const time = typeof value === "string" ? Date.parse(value) : NaN;
      if (!Number.isFinite(time) || (future ? time > now : time <= now)) {
        return { valid: false, message: `Credential ${field} is invalid or outside its validity period.` };
      }
    }
  }
  const details = {
    issuer,
    verificationMethod: methodId,
    cryptosuite: "ecdsa-sd-2023",
    signatureVerification: "verified",
    issuerAuthorization: "verified",
  };
  const status = document.credentialStatus;
  if (status !== undefined && (!Array.isArray(status) || status.length > 0)) {
    const statuses = Array.isArray(status) ? status : [status];
    if (statuses.every((entry) => isRecord(entry) && entry.type === "BitstringStatusListEntry")) {
      if (getIssuingMethods(document).includes("ethereum")) {
        return { valid: false, message: "Bitstring status profile supports DID-only issuance." };
      }
      const checked = await verifyBitstringStatuses(statuses, issuer, documentLoader);
      if (!checked.valid) return { ...checked, details: { ...details, ...checked.details } };
      return {
        valid: true,
        message: "Credential verified successfully (signature, issuer and signed status lists).",
        details: { ...details, credentialStatus: "verified", blockchainVerification: "not required" },
      };
    }
    if (statuses.length === 1 && isRecord(statuses[0]) &&
        statuses[0].type === "OpenAttestationDocumentStore") {
      const targetHash = statuses[0].targetHash;
      if (typeof targetHash !== "string" || !/^0x[\da-f]{64}$/i.test(targetHash)) {
        return { valid: false, message: "Document Store status requires a signed bytes32 targetHash.",
          details: { ...details, credentialStatus: "invalid" } };
      }
      let store: ReturnType<typeof getCredentialDocumentStore>;
      try {
        store = getCredentialDocumentStore(document);
      } catch {
        return { valid: false, message: "Credential contains an invalid or unsupported Document Store reference.",
          details: { ...details, credentialStatus: "invalid" } };
      }
      const network = NETWORKS[store.network];
      const ownProvider = documentStoreProvider ? null : new JsonRpcProvider(
        process.env[`${store.network.toUpperCase()}_RPC_URL`] ?? network.rpcUrl,
        network.chainId
      );
      const provider = documentStoreProvider ?? ownProvider!;
      let stage = "network";
      try {
        if ((await provider.getNetwork()).chainId !== BigInt(network.chainId)) {
          throw new Error("Document Store provider network mismatch.");
        }
        const contract = new Contract(store.address, DOCUMENT_STORE_ABI, provider);
        stage = "isIssued";
        const issued = Boolean(await contract.isIssued(targetHash));
        stage = "isRevoked";
        const revoked = issued ? Boolean(await contract.isRevoked(targetHash)) : false;
        return {
          valid: issued && !revoked,
          message: !issued ? "Credential hash is not registered in its Document Store." :
            revoked ? "Credential has been revoked on blockchain." :
              "Credential verified successfully (signature, issuer and Document Store status).",
          details: { ...details, credentialStatus: !issued ? "not issued" : revoked ? "revoked" : "verified",
            blockchainVerification: issued && !revoked ? "passed" : "failed",
            documentStoreAddress: store.address, documentStoreNetwork: store.network, targetHash, revoked },
        };
      } catch (error) {
        const code = isRecord(error) && typeof error.code === "string" &&
          /^[A-Z_]{1,40}$/.test(error.code) ? error.code : "UNKNOWN_ERROR";
        console.error("[verification] Document Store status lookup failed.", {
          stage, code, network: store.network, address: store.address,
        });
        return { valid: false, message: "Unable to check credential Document Store status.",
          details: { ...details, credentialStatus: "unavailable" } };
      } finally {
        ownProvider?.destroy();
      }
    }
    return {
      valid: false,
      message: "Credential signature and issuer are verified, but credentialStatus verification is unsupported.",
      details: { ...details, credentialStatus: "unsupported" },
    };
  }
  if (getIssuingMethods(document).includes("ethereum")) {
    const onChain = await verifyDocumentOnChain(
      document, ISSUER_CONFIG.documentStore, new JsonRpcProvider(NETWORKS.sepolia.rpcUrl)
    );
    return {
      valid: onChain.verified && !onChain.revoked,
      message: onChain.revoked ? "Credential has been revoked on blockchain." :
        onChain.verified ? "Credential verified successfully (on-chain and cryptographic)." :
          "Credential signature is valid but document not found on blockchain.",
      details: { ...details, blockchainVerification: onChain.verified ? "passed" : "failed",
        revoked: onChain.revoked },
    };
  }
  return {
    valid: true,
    message: "Credential verified successfully (cryptographic signature and issuer authorization).",
    details: { ...details, credentialStatus: "not present", blockchainVerification: "not required" },
  };
}

export function getCredentialDocumentStore(credential: Record<string, unknown>): {
  address: string;
  network: keyof typeof NETWORKS;
} {
  const raw = credential.credentialStatus;
  const statuses = Array.isArray(raw) ? raw : [raw];
  if (statuses.length !== 1 || !isRecord(statuses[0]) ||
      statuses[0].type !== "OpenAttestationDocumentStore" || typeof statuses[0].id !== "string") {
    throw new Error("Credential requires a single Document Store status reference.");
  }
  const match = /^did:ethr:(?:(sepolia|mainnet):)?(0x[\da-fA-F]{40})#[^\s]+$/.exec(statuses[0].id);
  if (!match || !isAddress(match[2])) throw new Error("Invalid Document Store status reference.");
  // Unqualified references were historically issued against Sepolia.
  return { address: match[2], network: match[1] === "mainnet" ? "mainnet" : "sepolia" };
}

async function verifyBitstringStatuses(
  entries: unknown[], issuer: string, loader: DocumentLoader
): Promise<VerificationResult> {
  if (entries.length !== 2 || !issuer.startsWith("did:web:") ||
      issuer.slice("did:web:".length).includes(":")) {
    return { valid: false, message: "Unsupported Bitstring Status List profile." };
  }
  const purposes = new Set<string>();
  const indices = new Set<string>();
  const pages = new Set<string>();
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.statusListCredential !== "string" ||
        typeof entry.statusListIndex !== "string" || !/^(0|[1-9][0-9]*)$/.test(entry.statusListIndex) ||
        (entry.statusSize !== undefined && entry.statusSize !== 1) ||
        (entry.statusPurpose !== "revocation" && entry.statusPurpose !== "suspension") ||
        purposes.has(entry.statusPurpose)) {
      return { valid: false, message: "Invalid Bitstring Status List entry." };
    }
    purposes.add(entry.statusPurpose);
    indices.add(entry.statusListIndex);
    const url = new URL(entry.statusListCredential);
    const domain = issuer.slice("did:web:".length);
    const path = /^\/api\/status-list\/(0|[1-9][0-9]{0,9})\/(revocation|suspension)$/.exec(url.pathname);
    if (url.origin !== `https://${domain}` || url.search || url.hash || url.username || url.password ||
        !path || Number(path[1]) > 2147483647 || path[2] !== entry.statusPurpose ||
        entry.id !== `${url.href}#${entry.statusListIndex}` ||
        Number(entry.statusListIndex) >= 131072) {
      return { valid: false, message: "Status list URL or index does not match the issuer profile." };
    }
    pages.add(path[1]);
    const response = await loader(url.href);
    const listDocument: unknown = response.document;
    if (!isRecord(listDocument) || listDocument.id !== url.href || listDocument.issuer !== issuer ||
        listDocument.credentialStatus !== undefined ||
        !Array.isArray(listDocument.type) || !listDocument.type.includes("VerifiableCredential") ||
        !listDocument.type.includes("BitstringStatusListCredential") ||
        !isRecord(listDocument.proof) || listDocument.proof.cryptosuite !== "ecdsa-sd-2023" ||
        listDocument.proof.type !== "DataIntegrityProof") {
      return { valid: false, message: "Invalid signed status list credential." };
    }
    const start = Date.parse(String(listDocument.validFrom));
    const end = Date.parse(String(listDocument.validUntil));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= Date.now() ||
        start > Date.now() || end - start > 60000 || end <= start) {
      return { valid: false, message: "Status list is expired, future-dated or exceeds the freshness limit." };
    }
    const verification = await verifyEcdsaCredential(listDocument, listDocument.proof, loader);
    if (!verification.valid) return { valid: false, message: `Status list proof failed: ${verification.message}` };
    const subject = listDocument.credentialSubject;
    if (!isRecord(subject) || subject.type !== "BitstringStatusList" ||
        subject.id !== `${url.href}#list` || subject.ttl !== 60000 ||
        subject.statusPurpose !== entry.statusPurpose || typeof subject.encodedList !== "string" ||
        subject.encodedList.length > 24000 || !/^u?[A-Za-z0-9_-]+$/.test(subject.encodedList)) {
      return { valid: false, message: "Invalid encoded status list subject." };
    }
    const { StatusList } = await loadCommonJSModule<typeof import("@trustvc/w3c-credential-status")>(
      "@trustvc/w3c-credential-status"
    );
    const { gunzipSync } = await loadCommonJSModule<typeof import("node:zlib")>("node:zlib");
    // Bare gzip base64url always starts with "H4sI", so a leading "u" is unambiguously Multibase.
    const encoded = subject.encodedList.startsWith("u") ? subject.encodedList.slice(1) : subject.encodedList;
    const uncompressed = gunzipSync(Buffer.from(encoded, "base64url"), {
      maxOutputLength: 16384,
    });
    // The SDK ignores Buffer.byteOffset, so provide an unpooled, exact-length buffer.
    const buffer = Buffer.alloc(uncompressed.length);
    uncompressed.copy(buffer);
    const list = new StatusList({ buffer });
    if (list.length !== 131072) return { valid: false, message: "Invalid status list length." };
    if (list.getStatus(Number(entry.statusListIndex))) {
      return {
        valid: false,
        message: entry.statusPurpose === "revocation" ? "Credential has been revoked." : "Credential is suspended.",
        details: { credentialStatus: entry.statusPurpose === "revocation" ? "revoked" : "suspended" },
      };
    }
  }
  if (indices.size !== 1 || pages.size !== 1) {
    return { valid: false, message: "Status list purposes must share a single allocation." };
  }
  return { valid: true, message: "Signed status lists verified." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripUnsupportedCredentialStatus(
  document: Record<string, unknown>
): Record<string, unknown> {
  const credentialStatus = document["credentialStatus"];
  if (!credentialStatus) {
    return document;
  }

  // Handle both single object and array forms (per W3C VC spec)
  if (Array.isArray(credentialStatus)) {
    const filtered = credentialStatus.filter(
      (status: Record<string, unknown>) =>
        typeof status === "object" &&
        status !== null &&
        (typeof status["statusListCredential"] === "string"
          ? !status["statusListCredential"].includes("tradetrust.io/status")
          : true)
    );
    if (filtered.length === credentialStatus.length) {
      return document;
    }
    return { ...document, credentialStatus: filtered };
  }

  const statusListCredential =
    typeof credentialStatus === "object" && credentialStatus !== null
      ? (credentialStatus as Record<string, unknown>)["statusListCredential"]
      : undefined;

  if (
    typeof statusListCredential === "string" &&
    (statusListCredential as string).includes("tradetrust.io/status")
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

export async function createTrustVCDocumentLoader() {
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

  const additionalContexts = {
    [TRUSTVC_CONFIG.didUrl]: didDocument,
    [LOCAL_DID_VERIFICATION_METHOD_ID]: {
      "@context": didDocument["@context"],
      ...(didDocument.verificationMethod[0] as Record<string, unknown>),
    },
  };
  return getDocumentLoader(additionalContexts);
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
 *   DID_PUBLIC_KEY_MULTIBASE  – multibase-encoded (z-prefixed) OR hex-encoded (0x||x32||y32) public key
 *   DID_PRIVATE_KEY_MULTIBASE – multibase-encoded private key (starts with "z")
 *
 * The private key is deliberately server-only: a NEXT_PUBLIC_ variant would be
 * inlined into the browser bundle and expose the issuer signing key.
 */
export function getDIDKeyPairFromEnv(): PrivateKeyPair | null {
  const id = process.env.DID_KEY_ID || process.env.NEXT_PUBLIC_DID_KEY_ID;
  const controller = process.env.DID_CONTROLLER || process.env.NEXT_PUBLIC_DID_CONTROLLER;
  let publicKeyMultibase = resolvePublicKeyMultibase();
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

export interface DIDSigningContext {
  did: string;
  verificationMethod: string;
  publicKeyMultibase: string;
  secretKeyMultibase: string;
}

export function getDIDKeyPairFromIssuerProfile(profile: {
  did: string;
  verificationMethod: string;
  keyReference: string;
}): PrivateKeyPair | null {
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(profile.keyReference)) {
    throw new Error("Issuer profile key reference is invalid.");
  }
  const secretKeyMultibase = process.env[profile.keyReference];
  const publicKeyMultibase = process.env[`${profile.keyReference}_PUBLIC_KEY_MULTIBASE`];
  if (!secretKeyMultibase || !publicKeyMultibase) return null;
  if (!secretKeyMultibase.startsWith("z") || !publicKeyMultibase.startsWith("z")) {
    throw new Error("Issuer profile signing keys must use base58btc multibase encoding.");
  }
  if (!profile.did.startsWith("did:") ||
      !profile.verificationMethod.startsWith(`${profile.did}#`)) {
    throw new Error("Issuer profile DID and verification method do not match.");
  }

  return {
    "@context": "https://w3id.org/security/multikey/v1",
    id: profile.verificationMethod,
    type: "Multikey",
    controller: profile.did,
    publicKeyMultibase,
    secretKeyMultibase,
  };
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
  secretKeyOverride?: string,
  signingContext?: DIDSigningContext
): Promise<DIDIssuanceResult> {
  const id = signingContext?.verificationMethod ??
    (process.env.DID_KEY_ID || process.env.NEXT_PUBLIC_DID_KEY_ID);
  const controller = signingContext?.did ??
    (process.env.DID_CONTROLLER || process.env.NEXT_PUBLIC_DID_CONTROLLER);
  const publicKeyMultibase = signingContext?.publicKeyMultibase ?? resolvePublicKeyMultibase();
  const secretKeyMultibase = signingContext?.secretKeyMultibase ??
    (secretKeyOverride?.trim() || process.env.DID_PRIVATE_KEY_MULTIBASE);

  const missing: string[] = [];
  if (!id) missing.push("DID_KEY_ID");
  if (!controller) missing.push("DID_CONTROLLER");
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
      credential: result.signed,
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
      credential: result.signed,
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
  documentStoreAddress?: string;
  alreadyRegistered?: boolean;
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
  signer: Signer
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
 * Requires an ethers v6 signer connected to the correct network (Sepolia).
 */
export async function issueCertificateToEthereum(
  credential: Record<string, unknown>,
  documentStoreAddress: string,
  signer: Signer
): Promise<EthereumIssuanceResult> {
  if (!documentStoreAddress) {
    return { error: "Document store address is required." };
  }

  try {
    const documentHash = computeDocumentStoreHash(credential);

    // Use ethers v6 with a minimal DocumentStore ABI to avoid
    // pulling in Node.js-only dependencies from @trustvc/trustvc.
    const contract = new Contract(
      documentStoreAddress,
      DOCUMENT_STORE_ABI,
      signer
    );

    if (await contract.isIssued(documentHash)) {
      if (await contract.isRevoked(documentHash)) {
        return { error: "This document has been revoked.", documentHash };
      }
      return { documentHash, credential, alreadyRegistered: true };
    }

    // Simulate before asking the wallet to send a potentially reverting transaction.
    try {
      await contract.issue.staticCall(documentHash);
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

    const tx = await contract.issue(documentHash);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      return { error: "Document Store issuance transaction was not confirmed successfully.", documentHash };
    }

    return {
      txHash: receipt.hash,
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
  signer: Signer,
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

    const contract = new Contract(
      documentStoreAddress,
      DOCUMENT_STORE_ABI,
      signer
    );

    const isRevoked = await contract.isRevoked(documentHash);

    if (isRevoked) {
      return { error: "This document is already revoked.", documentHash };
    }

    try {
      await contract.revoke.staticCall(documentHash);
    } catch (staticErr) {
      const staticMsg = (staticErr as Error).message ?? String(staticErr);
      return {
        error:
          "Pre-check failed — the connected wallet may not have revocation permissions on " +
          `this document store. (${staticMsg})`,
        documentHash,
      };
    }

    const tx = await contract.revoke(documentHash);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      return { error: "Document Store revocation transaction was not confirmed successfully.", documentHash };
    }

    return {
      txHash: receipt.hash,
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

export function computeDocumentStoreHash(
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

  // Also check credentialStatus[0].targetHash for single-credential documents.
  const statusArray = credential["credentialStatus"];
  if (Array.isArray(statusArray) && statusArray.length > 0) {
    const cs = statusArray[0] as Record<string, unknown>;
    const csTargetHash = cs?.["targetHash"];
    if (typeof csTargetHash === "string" && isBytes32Hex(csTargetHash)) {
      return csTargetHash;
    }
  }

  return keccak256(
    toUtf8Bytes(canonicalJson(credential))
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

/**
 * Adds the application's document-store commitment before signing, so it is
 * covered by the proof. This is not an OpenAttestation Merkle proof.
 */
function injectTargetHash(
  unsignedCredential: Record<string, unknown>
): Record<string, unknown> {
  const statusArray = unsignedCredential.credentialStatus;
  if (!Array.isArray(statusArray) || statusArray.length === 0) {
    return unsignedCredential;
  }

  const firstStatus = statusArray[0];
  if (
    !firstStatus ||
    typeof firstStatus !== "object" ||
    firstStatus.type !== "OpenAttestationDocumentStore"
  ) {
    return unsignedCredential;
  }

  const { targetHash: _oldHash, ...statusWithoutHash } = firstStatus;
  const credential = {
    ...unsignedCredential,
    credentialStatus: [statusWithoutHash, ...statusArray.slice(1)],
  };
  const targetHash = keccak256(toUtf8Bytes(canonicalJson(credential)));

  return {
    ...credential,
    credentialStatus: [{ ...statusWithoutHash, targetHash }, ...statusArray.slice(1)],
  };
}
