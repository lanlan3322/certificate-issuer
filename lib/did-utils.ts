/**
 * DID Utilities – shared key parsing for API routes and trustvc.
 *
 * Signing key configuration shared by trustvc and server publication helpers.
 * Server-only JWK parsing and curve validation live in did-publication.ts.
 */

/**
 * Convert hex-encoded public key (0x || x32 || y32) to Base58 multibase.
 */
export function hexPubKeyToMultibase(hex: string): string {
  const bs58 = require("bs58");
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = Buffer.from(clean, "hex");
  return `z${bs58.encode(bytes).toString()}`;
}

/**
 * Resolve the public key multibase from env vars.
 *
 * • Hex → Base58 multibase conversion applied automatically.
 * • Existing z-prefixed multibase passed through unchanged.
 * • Static fallback when nothing is configured.
 */
export function resolvePublicKeyMultibase(): string {
  const raw =
    process.env.DID_PUBLIC_KEY_MULTIBASE || process.env.NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE;

  if (!raw) return "zDnaepZZHFcKxZ9r1xgqMqMFELf67VEmhFUddFBt2LPajim5z";
  if (raw.startsWith("0x")) return hexPubKeyToMultibase(raw);
  return raw;
}

/**
 * Resolve the controller DID from env vars.
 */
export function resolveDIDController(): string {
  return process.env.DID_CONTROLLER || process.env.NEXT_PUBLIC_DID_CONTROLLER || "did:web:verifiable.sg";
}

/**
 * Resolve the key ID from env vars.
 */
export function resolveDidKeyId(): string {
  return (
    process.env.DID_KEY_ID ||
    process.env.NEXT_PUBLIC_DID_KEY_ID ||
    `${resolveDIDController()}#key-1`
  );
}