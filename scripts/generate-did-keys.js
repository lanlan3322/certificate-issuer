/**
 * Generate-secp256k1 DID key pair for the certificate-issuer.
 * Outputs env vars and updated x/y coordinates for static files.
 */
const { Wallet } = require("ethers");
const bs58 = require("bs58");

function toBase64url(hex) {
  return Buffer.from(hex, "hex").toString("base64url");
}

// Generate new secp256k1 key pair
const wallet = Wallet.createRandom();
const pubKeyHex = wallet.publicKey; // 0x04 || x(32 bytes) || y(32 bytes)

const xHex = pubKeyHex.slice(2, 66);
const yHex = pubKeyHex.slice(66, 130);
const privateKeyHex = wallet.privateKey.slice(2); // remove '0x'

console.log("=== Copy into .env.local ===");
console.log(`DID_KEY_ID=did:web:verifiable.sg#key-1`);
console.log(`DID_CONTROLLER=did:web:verifiable.sg`);
console.log(`DID_PUBLIC_KEY_MULTIBASE=${pubKeyHex}`);
console.log(`DID_PRIVATE_KEY_MULTIBASE=z${bs58.encode(Buffer.from(privateKeyHex, "hex")).toString()}`);

console.log("\n=== Updated did.json publicKeyJwk x/y (base64url) ===");
console.log(`x: ${toBase64url(xHex)}`);
console.log(`y: ${toBase64url(yHex)}`);

console.log("\n=== Updated jwks.json keys[].x/y (base64url) ===");
console.log(`x: ${toBase64url(xHex)}`);
console.log(`y: ${toBase64url(yHex)}`);
