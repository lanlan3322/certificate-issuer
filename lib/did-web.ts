// did:web DID Method Resolution
// Spec: https://w3c-ccg.github.io/did-method-web/
//
// did:web resolves a DID identifier to an HTTPS URL hosting a DID Document.
// Resolution rules:
//   did:web:<domain>            → https://<domain>/.well-known/did.json
//   did:web:<domain>:<path>:... → https://<domain>/<path>/.../did.json
// where colons in the domain-specific part map to "/" path separators,
// and percent-encoded characters are decoded.

/** Represents a verification method entry in a DID Document. */
export interface DidVerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, string>;
}

/** Represents a service endpoint entry in a DID Document. */
export interface DidService {
  id: string;
  type: string;
  serviceEndpoint: string;
}

/** Represents a W3C DID Document. */
export interface DidDocument {
  "@context": string | string[];
  id: string;
  verificationMethod?: DidVerificationMethod[];
  authentication?: (string | DidVerificationMethod)[];
  assertionMethod?: (string | DidVerificationMethod)[];
  service?: DidService[];
}

/**
 * Convert a did:web identifier to its HTTPS URL.
 *
 * @param did — A did:web identifier (e.g. "did:web:example.com:path:to")
 * @returns The HTTPS URL where the DID Document is hosted.
 * @throws If the DID is not a valid did:web identifier.
 */
export function didWebToUrl(did: string): string {
  if (!did.startsWith("did:web:")) {
    throw new Error(`Invalid did:web identifier: ${did}`);
  }

  const specificId = did.slice("did:web:".length);
  if (!specificId) {
    throw new Error(`Invalid did:web identifier: ${did}`);
  }

  // Split on ":" to separate domain and optional path segments.
  const parts = specificId.split(":");

  // First part is the domain (with percent-encoded port if present).
  const domain = decodeURIComponent(parts[0]);

  if (parts.length === 1) {
    // No path segments → /.well-known/did.json
    return `https://${domain}/.well-known/did.json`;
  }

  // Remaining parts are path segments.
  const pathSegments = parts.slice(1).map(decodeURIComponent);
  return `https://${domain}/${pathSegments.join("/")}/did.json`;
}

/**
 * Resolve a did:web identifier to a DID Document.
 *
 * @param did — A did:web identifier.
 * @returns The parsed DID Document.
 * @throws If resolution fails or the document is invalid.
 */
export async function resolveDidWeb(did: string): Promise<DidDocument> {
  const url = didWebToUrl(did);

  const response = await fetch(url, {
    headers: { Accept: "application/did+json, application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to resolve ${did}: HTTP ${response.status} ${response.statusText}`
    );
  }

  const document: DidDocument = await response.json();

  // Basic validation: the document "id" must match the DID being resolved.
  if (document.id !== did) {
    throw new Error(
      `DID Document id mismatch: expected "${did}", got "${document.id}"`
    );
  }

  return document;
}

/**
 * Look up a specific verification method by its full ID within a DID Document.
 *
 * @param document — The DID Document to search.
 * @param methodId — The full verification method ID (e.g. "did:web:...#keys-1").
 * @returns The matching verification method, or undefined if not found.
 */
export function findVerificationMethod(
  document: DidDocument,
  methodId: string
): DidVerificationMethod | undefined {
  return document.verificationMethod?.find((vm) => vm.id === methodId);
}

/**
 * Check whether a given verification method ID is listed in the
 * assertionMethod relationship of the DID Document.
 *
 * @param document — The DID Document.
 * @param methodId — The verification method ID.
 * @returns true if the method is authorized for assertion.
 */
export function isAssertionMethod(
  document: DidDocument,
  methodId: string
): boolean {
  if (!document.assertionMethod) return false;
  return document.assertionMethod.some((entry) =>
    typeof entry === "string" ? entry === methodId : entry.id === methodId
  );
}
