import { createHash, createPublicKey, ECDH, sign, verify, type KeyObject } from "node:crypto";
import bs58 from "bs58";
import { validateManagedDocument, type ManagedDIDDocument } from "./managed-did";
import { isRootDidWeb } from "./did-publication";
import { createSafeDocumentLoader } from "./safe-document-loader";

export const LINKAGE_CONTEXT = "https://identity.foundation/.well-known/did-configuration/v1";
export function customerDomain(value: string): string {
  const domain = value.trim().toLowerCase();
  if (domain.length > 253 || !isRootDidWeb(`did:web:${domain}`) ||
      domain === "verifiable.sg" || domain.endsWith(".verifiable.sg") ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(domain) ||
      !/\.[a-z][a-z0-9-]{1,62}$/.test(domain)) {
    throw new Error("Enter a public DNS domain only, without scheme, path, port or Verifiable.sg hostname.");
  }
  return domain;
}
export function customerDocument(managed: ManagedDIDDocument, domain: string): ManagedDIDDocument {
  const did = `did:web:${customerDomain(domain)}`;
  const remap = (id: string) => `${did}${id.slice(managed.id.length)}`;
  return {
    "@context": [...managed["@context"]], id: did,
    verificationMethod: managed.verificationMethod.map(method => ({
      ...method, id: remap(method.id), controller: did,
    })),
    authentication: managed.authentication.map(remap),
    assertionMethod: managed.assertionMethod.map(remap),
  };
}
export function validateCustomerDocument(value: unknown, domain: string): ManagedDIDDocument {
  const did = `did:web:${customerDomain(domain)}`;
  // Reuse the exact public-key allowlist and curve/relationship validation.
  const placeholder = "did:web:verifiable.sg:organizations:validation";
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Customer DID document is invalid.");
  const raw = value as Record<string, unknown>;
  if (raw.id !== did) throw new Error("Customer DID does not match the configured domain.");
  const remap = (id: unknown) => typeof id === "string" && id.startsWith(`${did}#`)
    ? `${placeholder}${id.slice(did.length)}` : id;
  const transformed = {
    ...raw, id: placeholder,
    verificationMethod: Array.isArray(raw.verificationMethod) ? raw.verificationMethod.map(method =>
      method && typeof method === "object" ? {
        ...method, id: remap(method.id), controller: method.controller === did ? placeholder : method.controller,
      } : method) : raw.verificationMethod,
    authentication: Array.isArray(raw.authentication) ? raw.authentication.map(remap) : raw.authentication,
    assertionMethod: Array.isArray(raw.assertionMethod) ? raw.assertionMethod.map(remap) : raw.assertionMethod,
  };
  return customerDocument(validateManagedDocument(transformed, placeholder), domain);
}
export function documentDigest(document: ManagedDIDDocument): string {
  return createHash("sha256").update(JSON.stringify(document)).digest("hex");
}
export function createDomainLinkage(privateKey: KeyObject, did: string, method: string, now = new Date()) {
  const origin = `https://${customerDomain(did.slice("did:web:".length))}`;
  if (!method.startsWith(`${did}#`)) throw new Error("Invalid domain linkage signer.");
  const nbf = Math.floor(now.getTime() / 1000), exp = nbf + 365 * 86400;
  const vc = {
    "@context": ["https://www.w3.org/2018/credentials/v1", LINKAGE_CONTEXT],
    issuer: did, issuanceDate: new Date(nbf * 1000).toISOString(),
    expirationDate: new Date(exp * 1000).toISOString(),
    type: ["VerifiableCredential", "DomainLinkageCredential"],
    credentialSubject: { id: did, origin },
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "ES256", kid: method })}.${encode({ exp, iss: did, nbf, sub: did, vc })}`;
  const jwt = `${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  return { document: { "@context": LINKAGE_CONTEXT, linked_dids: [jwt] }, expiresAt: new Date(exp * 1000).toISOString() };
}
export function validateDomainLinkage(value: unknown, document: ManagedDIDDocument, now = Date.now()): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid DID configuration.");
  const resource = value as Record<string, unknown>;
  if (Object.keys(resource).sort().join(",") !== "@context,linked_dids" ||
      resource["@context"] !== LINKAGE_CONTEXT || !Array.isArray(resource.linked_dids) ||
      resource.linked_dids.length !== 1 || typeof resource.linked_dids[0] !== "string") {
    throw new Error("Deploy the generated DID configuration without modification.");
  }
  const parts = resource.linked_dids[0].split(".");
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error("Invalid linkage JWT.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  const method = document.verificationMethod.find(entry => entry.id === header.kid);
  if (Object.keys(header).sort().join(",") !== "alg,kid" || header.alg !== "ES256" || !method ||
      !document.assertionMethod.includes(method.id) || Object.keys(claims).sort().join(",") !== "exp,iss,nbf,sub,vc" ||
      claims.iss !== document.id || claims.sub !== document.id ||
      !Number.isSafeInteger(claims.nbf) || !Number.isSafeInteger(claims.exp) ||
      claims.nbf * 1000 > now || claims.exp * 1000 <= now || claims.exp <= claims.nbf ||
      claims.vc?.issuer !== document.id || claims.vc?.credentialSubject?.id !== document.id ||
      claims.vc?.credentialSubject?.origin !== `https://${document.id.slice(8)}` ||
      claims.vc?.issuanceDate !== new Date(claims.nbf * 1000).toISOString() ||
      claims.vc?.expirationDate !== new Date(claims.exp * 1000).toISOString() ||
      JSON.stringify(claims.vc?.["@context"]) !== JSON.stringify(["https://www.w3.org/2018/credentials/v1", LINKAGE_CONTEXT]) ||
      JSON.stringify(claims.vc?.type) !== JSON.stringify(["VerifiableCredential", "DomainLinkageCredential"])) {
    throw new Error("Domain linkage claims or expiry are invalid.");
  }
  const bytes = Buffer.from(bs58.decode(method.publicKeyMultibase.slice(1)));
  const point = ECDH.convertKey(bytes.subarray(2), "prime256v1", undefined, undefined, "uncompressed");
  if (!Buffer.isBuffer(point)) throw new Error("Invalid linkage public key.");
  const key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256",
    x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33).toString("base64url") } });
  const signature = Buffer.from(parts[2], "base64url");
  if (signature.length !== 64 || !verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`),
    { key, dsaEncoding: "ieee-p1363" }, signature)) throw new Error("Domain linkage signature is invalid.");
}
export async function fetchCustomerFiles(domain: string) {
  const origin = `https://${customerDomain(domain)}`;
  const loader = createSafeDocumentLoader(async () => { throw new Error("Local loading is disabled."); }, new Set(), new Set(),
    { allowRedirects: false });
  const [did, linkage] = await Promise.all([
    loader(`${origin}/.well-known/did.json`), loader(`${origin}/.well-known/did-configuration.json`),
  ]);
  return { document: validateCustomerDocument(did.document, domain), linkage: linkage.document };
}
export async function fetchCustomerDocument(domain: string) {
  const origin = `https://${customerDomain(domain)}`;
  const loader = createSafeDocumentLoader(async () => { throw new Error("Local loading is disabled."); }, new Set(), new Set(),
    { allowRedirects: false });
  return validateCustomerDocument((await loader(`${origin}/.well-known/did.json`)).document, domain);
}
export async function assertCustomerDeployment(config: {
  domain: string; expected_document: unknown; linkage_document: unknown;
}) {
  const expected = validateCustomerDocument(config.expected_document, config.domain);
  const deployed = await fetchCustomerFiles(config.domain);
  if (documentDigest(deployed.document) !== documentDigest(expected)) throw new Error("Deploy the latest generated DID document.");
  validateDomainLinkage(deployed.linkage, expected);
  validateDomainLinkage(config.linkage_document, expected);
  if (JSON.stringify(deployed.linkage) !== JSON.stringify(config.linkage_document)) {
    // Ordering of the two outer JSON fields is not significant.
    const saved = config.linkage_document as { linked_dids: string[] };
    const hosted = deployed.linkage as { linked_dids: string[] };
    if (saved.linked_dids[0] !== hosted.linked_dids[0]) throw new Error("Deploy the generated domain linkage credential.");
  }
}
