/**
 * DID Utilities – shared key parsing for API routes and trustvc.
 *
 * All code that needs to resolve a public key from the `DID_PUBLIC_KEY_MULTIBASE`
 * env var should go through these helpers instead of duplicating hex → JWK conversion.
 */

// Default static fallback coordinates (from the original did.json / jwks.json)
const DEFAULT_X = "BA_kfttf2yH27Q4gI7zl7jJfoVqBKb2wdoXCb5cip3w";
const DEFAULT_Y = "goHOSYzG4sTeulIthj2wWh8ngxtvawPxlQVEFyg1eIc";

/**
 * Convert a hex-encoded uncompressed secp256k1 public key (0x || x32 || y32)
 * to JWK-style base64url x/y coordinates.
 */
export function hexToBase64url(x: string, y: string): { x: string; y: string } {
  return {
    x: Buffer.from(x, "hex").toString("base64url"),
    y: Buffer.from(y, "hex").toString("base64url"),
  };
}

/**
 * Resolve public key JWK coordinates from the DID_PUBLIC_KEY_MULTIBASE env var.
 *
 * Supports both formats:
 *   • Hex-encoded (0x || x32 || y32) – e.g. `0x<64 hex chars for x><64 hex chars for y>`
 *   • Base58 multibase (z-prefixed) – ignored (x/y already embedded in it)
 *
 * Falls back to static defaults when the env var is missing or unrecognised.
 */
export function resolvePublicKeyJWK(): { x: string; y: string } {
  const raw =
    process.env.DID_PUBLIC_KEY_MULTIBASE || process.env.NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE;

  if (raw && raw.startsWith("0x") && raw.length >= 130) {
    try {
      return hexToBase64url(raw.slice(2, 66), raw.slice(66, 130));
    } catch {
      // Silently fall through to defaults on parse failure
    }
  }

  return { x: DEFAULT_X, y: DEFAULT_Y };
}

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