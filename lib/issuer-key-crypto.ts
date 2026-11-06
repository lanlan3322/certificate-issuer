import { createCipheriv, createDecipheriv, createECDH, createHash, createPrivateKey, createPublicKey,
  ECDH, generateKeyPairSync, randomBytes, type KeyObject } from "node:crypto";
import bs58 from "bs58";

export class IssuerKeyError extends Error {
  constructor(message = "Issuer key operation failed.", public readonly status = 503) { super(message); }
}
export interface KeyScope {
  organizationId: string; issuerId: string; keyVersion: number; encryptionKeyId: string;
}
export interface KeyMaterial {
  publicKey: string; publicKeyMultibase: string; fingerprint: string;
  encryptedPrivateKey: string; encryptionKeyId: string;
}

function master(id: string): Buffer {
  const currentId = process.env.ISSUER_KEY_ENCRYPTION_KEY_ID || "v1";
  let encoded: unknown = process.env.ISSUER_KEY_ENCRYPTION_KEY;
  if (id !== currentId) {
    try { encoded = JSON.parse(process.env.ISSUER_KEY_ENCRYPTION_PREVIOUS_KEYS || "{}")[id]; }
    catch { throw new IssuerKeyError("Issuer key encryption configuration is invalid."); }
  }
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new IssuerKeyError("A base64-encoded 256-bit issuer encryption key is required.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    key.fill(0);
    throw new IssuerKeyError("Issuer key encryption configuration is invalid.");
  }
  return key;
}

function aad(scope: KeyScope) {
  return Buffer.from(JSON.stringify(["issuer-key",1,scope.organizationId,scope.issuerId,
    "P-256",scope.keyVersion,scope.encryptionKeyId]));
}

export function encryptPrivateKey(privateDer: Buffer, scope: KeyScope): string {
  const key = master(scope.encryptionKeyId);
  try {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad(scope));
    const encrypted = Buffer.concat([cipher.update(privateDer), cipher.final()]);
    return JSON.stringify({ v: 1, iv: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") });
  } finally { key.fill(0); }
}

export function decryptPrivateKey(envelope: string, scope: KeyScope): Buffer {
  const key = master(scope.encryptionKeyId);
  let partial: Buffer | undefined;
  try {
    const value = JSON.parse(envelope);
    if (value.v !== 1 || typeof value.iv !== "string" || typeof value.tag !== "string" || typeof value.data !== "string") {
      throw new Error();
    }
    const iv = Buffer.from(value.iv,"base64"), tag = Buffer.from(value.tag,"base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad(scope)); cipher.setAuthTag(tag);
    partial = cipher.update(Buffer.from(value.data,"base64"));
    return Buffer.concat([partial,cipher.final()]);
  } catch { throw new IssuerKeyError("Issuer key authentication failed."); }
  finally { key.fill(0); partial?.fill(0); }
}

export function publicMaterial(privateKey: KeyObject) {
  const publicObject = createPublicKey(privateKey);
  const jwk = publicObject.export({ format: "jwk" });
  if (jwk.crv !== "P-256" || !jwk.x || !jwk.y) throw new IssuerKeyError("Only P-256 issuer keys are supported.");
  const point = Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,"base64url"),Buffer.from(jwk.y,"base64url")]);
  const compressed = ECDH.convertKey(point,"prime256v1",undefined,undefined,"compressed");
  if (typeof compressed === "string") throw new IssuerKeyError("Invalid public key encoding.");
  const der = publicObject.export({ format: "der", type: "spki" });
  return {
    publicKey: publicObject.export({ format: "pem", type: "spki" }).toString(),
    publicKeyMultibase: `z${bs58.encode(Buffer.concat([Buffer.from([0x80,0x24]),compressed]))}`,
    fingerprint: `SHA256:${createHash("sha256").update(der).digest("base64")}`,
  };
}

export function provisionKey(organizationId: string, issuerId: string, keyVersion: number,
  imported?: KeyObject): KeyMaterial {
  const encryptionKeyId = process.env.ISSUER_KEY_ENCRYPTION_KEY_ID || "v1";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(encryptionKeyId)) throw new IssuerKeyError("Invalid issuer encryption key identifier.");
  const privateKey = imported ?? generateKeyPairSync("ec",{ namedCurve:"prime256v1" }).privateKey;
  const der = privateKey.export({ format:"der",type:"pkcs8" });
  try {
    return { ...publicMaterial(privateKey), encryptionKeyId,
      encryptedPrivateKey: encryptPrivateKey(der,{organizationId,issuerId,keyVersion,encryptionKeyId}) };
  } finally { der.fill(0); }
}

export function privateKeyObject(envelope: string, scope: KeyScope) {
  const der = decryptPrivateKey(envelope,scope);
  try { return createPrivateKey({ key:der,format:"der",type:"pkcs8" }); }
  catch { throw new IssuerKeyError("Issuer key could not be decoded."); }
  finally { der.fill(0); }
}

export function signingMultikey(privateKey: KeyObject, did: string, verificationMethod: string) {
  const jwk = privateKey.export({ format:"jwk" });
  if (!jwk.d || jwk.crv !== "P-256") throw new IssuerKeyError("Invalid issuer signing key.");
  const scalar = Buffer.from(jwk.d,"base64url");
  try {
    return { did, verificationMethod, publicKeyMultibase:publicMaterial(privateKey).publicKeyMultibase,
      secretKeyMultibase:`z${bs58.encode(Buffer.concat([Buffer.from([0x86,0x26]),scalar]))}` };
  } finally { scalar.fill(0); }
}

export function importMultikey(secret: string, publicMultikey: string): KeyObject {
  let raw: Buffer | undefined;
  try {
    if (!secret.startsWith("z") || !publicMultikey.startsWith("z")) throw new Error();
    raw = Buffer.from(bs58.decode(secret.slice(1)));
    const pub = Buffer.from(bs58.decode(publicMultikey.slice(1)));
    if (raw.length !== 34 || raw[0] !== 0x86 || raw[1] !== 0x26 ||
      pub.length !== 35 || pub[0] !== 0x80 || pub[1] !== 0x24) throw new Error();
    const point = Buffer.from(ECDH.convertKey(pub.subarray(2),"prime256v1",undefined,undefined,"uncompressed"));
    const privateKey = createPrivateKey({ format:"jwk",key:{
      kty:"EC",crv:"P-256",x:point.subarray(1,33).toString("base64url"),
      y:point.subarray(33).toString("base64url"),d:raw.subarray(2).toString("base64url"),
    } });
    const ecdh = ECDH.convertKey(pub.subarray(2),"prime256v1",undefined,undefined,"compressed");
    if (typeof ecdh === "string") throw new Error();
    const actual = publicMaterial(privateKey).publicKeyMultibase;
    if (`z${bs58.encode(Buffer.concat([Buffer.from([0x80,0x24]),ecdh]))}` !== actual) throw new Error();
    // Node's JWK importer accepts inconsistent public coordinates; derive them from d.
    const derived = createECDH("prime256v1"); derived.setPrivateKey(raw.subarray(2));
    if (!derived.getPublicKey().equals(point)) throw new Error();
    return privateKey;
  } catch { throw new IssuerKeyError("Legacy issuer key import failed; verify P-256 key configuration."); }
  finally { raw?.fill(0); }
}
