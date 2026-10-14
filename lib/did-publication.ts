import { createHash, ECDH } from "node:crypto";
import historicalDID from "../public/.well-known/did.json";
import historicalJWKS from "../public/.well-known/jwks.json";
import { resolveDIDController, resolveDidKeyId } from "./did-utils";

interface PublicJWK {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid: string;
}

interface PublicVerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyJwk?: PublicJWK;
  publicKeyMultibase?: string;
  "@context"?: string;
}

function parsePublicKey(raw: string, kid: string): PublicJWK {
  let bytes: Buffer;
  let curve: string;
  let crv: string;
  if (raw.startsWith("0x")) {
    if (!/^0x(?:04)?[0-9a-fA-F]{128}$/.test(raw)) {
      throw new Error("DID public key must be a complete uncompressed hex point.");
    }
    const hex = raw.slice(2);
    bytes = Buffer.from(hex.length === 128 ? `04${hex}` : hex, "hex");
    curve = "secp256k1";
    crv = "secp256k1";
  } else if (raw.startsWith("z")) {
    const bs58 = require("bs58") as { decode: (value: string) => Uint8Array };
    bytes = Buffer.from(bs58.decode(raw.slice(1)));
    const prefix = bytes.subarray(0, 2).toString("hex");
    if (prefix === "8024") {
      curve = "prime256v1";
      crv = "P-256";
    } else if (prefix === "8124") {
      curve = "secp384r1";
      crv = "P-384";
    } else {
      throw new Error("DID publication requires a P-256 or P-384 public Multikey codec.");
    }
    bytes = bytes.subarray(2);
    const expectedLength = crv === "P-256" ? 33 : 49;
    if (bytes.length !== expectedLength || ![2, 3].includes(bytes[0])) {
      throw new Error("DID public Multikey must contain a compressed curve point.");
    }
  } else {
    throw new Error("Unsupported DID public key encoding.");
  }
  const point = ECDH.convertKey(bytes, curve, undefined, undefined, "uncompressed");
  if (!Buffer.isBuffer(point)) {
    throw new Error("DID public key conversion did not return a binary point.");
  }
  const size = (point.length - 1) / 2;
  return {
    kty: "EC", crv, kid,
    x: point.subarray(1, size + 1).toString("base64url"),
    y: point.subarray(size + 1).toString("base64url"),
  };
}

export function buildPublicDID() {
  const document = {
    ...structuredClone(historicalDID),
    verificationMethod: historicalDID.verificationMethod.map(
      (method): PublicVerificationMethod => structuredClone(method)
    ),
  };
  const jwks = structuredClone(historicalJWKS);
  const raw = process.env.DID_PUBLIC_KEY_MULTIBASE ||
    process.env.NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE;
  if (!raw) {
    return { document, jwks };
  }
  const controller = resolveDIDController();
  const id = resolveDidKeyId();
  if (controller !== document.id || !id.startsWith(`${controller}#`) ||
      !/^[A-Za-z0-9._-]+$/.test(id.slice(controller.length + 1))) {
    throw new Error("DID publication requires the existing controller and a full fragment key ID.");
  }
  const jwk = parsePublicKey(raw, id.slice(controller.length + 1));
  const existing = document.verificationMethod.find((method) => method.id === id);
  if (existing) {
    const old = existing.publicKeyJwk;
    const matches = existing.publicKeyMultibase === raw ||
      (old && old.kty === jwk.kty && old.crv === jwk.crv && old.x === jwk.x && old.y === jwk.y);
    if (!matches) {
      throw new Error("DID key conflicts with a historical method. Use a distinct method ID.");
    }
    return {
      document,
      jwks: {
        ...jwks,
        keys: jwks.keys.some((key) =>
          key.crv === jwk.crv && key.x === jwk.x && key.y === jwk.y)
          ? jwks.keys : [...jwks.keys, { ...jwk, use: "sig" }],
      },
    };
  }
  // Extend historical documents rather than replacing their key identities.
  const method = raw.startsWith("z")
    ? { "@context": "https://w3id.org/security/multikey/v1",
      id, type: "Multikey", controller, publicKeyMultibase: raw }
    : { id, type: "JsonWebKey2020", controller, publicKeyJwk: jwk };
  const context = "https://w3id.org/security/multikey/v1";
  return {
    document: {
      ...document,
      "@context": raw.startsWith("z") && !document["@context"].includes(context)
        ? [...document["@context"], context] : document["@context"],
      verificationMethod: [...document.verificationMethod, method],
      assertionMethod: [...document.assertionMethod, id],
    },
    jwks: { ...jwks, keys: [...jwks.keys, { ...jwk, use: "sig" }] },
  };
}

export function publicDocumentHeaders(document: unknown, contentType: string) {
  return {
    "Content-Type": contentType,
    ETag: `"${createHash("sha256").update(JSON.stringify(document)).digest("hex")}"`,
    "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
  };
}
