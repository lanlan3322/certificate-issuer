const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { mkdtemp, readFile, stat, unlink, rmdir } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { prepareDIDKeyMaterial } = require("./generate-did-keys");

const original = JSON.parse(readFileSync(
  path.join(__dirname, "../public/.well-known/did.json"), "utf8"
));
const keyId = `${original.id}#ecdsa-test`;
const originalJWKS = JSON.parse(readFileSync(
  path.join(__dirname, "../public/.well-known/jwks.json"), "utf8"
));

test("prepare a supported key while preserving all existing DID methods", async () => {
  const before = structuredClone(original);
  const jwksBefore = structuredClone(originalJWKS);
  const { candidate, jwksCandidate, environment } = await prepareDIDKeyMaterial({
    document: original, jwksDocument: originalJWKS, keyId,
  });
  assert.deepEqual(original, before);
  assert.deepEqual(originalJWKS, jwksBefore);
  assert.deepEqual(jwksCandidate.keys.slice(0, -1), originalJWKS.keys);
  assert.deepEqual(candidate.verificationMethod.slice(0, -1), before.verificationMethod);
  assert.deepEqual(candidate.assertionMethod.slice(0, -1), before.assertionMethod);
  assert.deepEqual(candidate.authentication, before.authentication);
  assert.deepEqual(candidate.service, before.service);
  const method = candidate.verificationMethod.at(-1);
  assert.equal(method.id, keyId);
  assert.equal(method.type, "Multikey");
  assert.equal(candidate.assertionMethod.at(-1), keyId);
  assert.ok(!JSON.stringify(candidate).includes("secretKey"));
  const env = require("dotenv").parse(environment);
  const { from, fromJwk } = await import("@digitalbazaar/ecdsa-multikey");
  const privateKey = await from({ ...method, secretKeyMultibase: env.DID_PRIVATE_KEY_MULTIBASE });
  const publicKey = await from(method);
  const data = new TextEncoder().encode("public DID key pair correspondence");
  const signature = await privateKey.signer().sign({ data });
  assert.equal(await publicKey.verifier().verify({ data, signature }), true);
  const jwk = jwksCandidate.keys.at(-1);
  assert.equal(jwk.crv, "P-256");
  assert.equal(jwk.kid, "ecdsa-test");
  const jwkVerifier = await fromJwk({ jwk });
  assert.equal(await jwkVerifier.verifier().verify({ data, signature }), true);
  assert.ok(!JSON.stringify({ candidate, jwksCandidate }).includes(env.DID_PRIVATE_KEY_MULTIBASE));
  assert.equal(env.DID_KEY_ID, method.id);
  assert.equal(env.DID_PUBLIC_KEY_MULTIBASE, method.publicKeyMultibase);
});

test("existing IDs and invalid fragments cannot replace a historical key", async () => {
  for (const invalid of [original.id, `${original.id}#key-1`, "did:web:other.example#key-2",
    `${original.id}#`, `${original.id}#bad\nDID_CONTROLLER=other`]) {
    await assert.rejects(prepareDIDKeyMaterial({ document: original, keyId: invalid }));
  }
  await assert.rejects(prepareDIDKeyMaterial({
    document: { ...original, assertionMethod: [...original.assertionMethod, keyId] }, keyId,
  }), /already exists/);
  for (const kid of ["ecdsa-test", keyId]) {
    await assert.rejects(prepareDIDKeyMaterial({
      document: original, keyId,
      jwksDocument: { keys: [...originalJWKS.keys, { kid }] },
    }), /already exists in JWKS/);
  }
  await assert.rejects(prepareDIDKeyMaterial({
    document: original, keyId, jwksDocument: { keys: {} },
  }), /keys must be an array/);
});

test("candidate DID and secret support real ecdsa-sd-2023 issuance and verification", async () => {
  const { candidate, environment } = await prepareDIDKeyMaterial({ document: original, keyId });
  const { getDocumentLoader } = require("@trustvc/w3c-context");
  const { signCredential, deriveCredential, verifyCredential } = require("@trustvc/w3c-vc");
  const env = require("dotenv").parse(environment);
  const method = candidate.verificationMethod.at(-1);
  const documentLoader = await getDocumentLoader({
    [candidate.id]: candidate,
    [keyId]: method,
  });
  const credential = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential"],
    issuer: candidate.id,
    credentialSubject: { id: "urn:uuid:test-key-workflow" },
  };
  const result = await signCredential(credential, {
    ...method, secretKeyMultibase: env.DID_PRIVATE_KEY_MULTIBASE,
  }, "ecdsa-sd-2023", { documentLoader });
  assert.ok(result.signed, result.error);
  assert.equal(result.signed.proof.verificationMethod, keyId);
  const disclosure = await deriveCredential(result.signed, ["/credentialSubject"], { documentLoader });
  assert.ok(disclosure.derived, disclosure.error);
  const verification = await verifyCredential(disclosure.derived, { documentLoader });
  assert.equal(verification.verified, true, verification.error);
});

test("CLI writes owner-only files outside git without printing private key material", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "did-preparation-"));
  const directory = path.join(root, "prepared");
  t.after(async () => {
    for (const name of ["signing.env", "did.candidate.json", "jwks.candidate.json"]) {
      await unlink(path.join(directory, name));
    }
    await rmdir(directory);
    await rmdir(root);
  });
  const args = [path.join(__dirname, "generate-did-keys.js"), "--output-dir", directory, "--key-id", keyId];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const environment = await readFile(path.join(directory, "signing.env"), "utf8");
  const secret = require("dotenv").parse(environment).DID_PRIVATE_KEY_MULTIBASE;
  assert.ok(secret);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(path.join(directory, "signing.env"))).mode & 0o777, 0o600);
  const candidate = JSON.parse(await readFile(path.join(directory, "did.candidate.json"), "utf8"));
  const jwksCandidate = JSON.parse(await readFile(path.join(directory, "jwks.candidate.json"), "utf8"));
  assert.deepEqual(candidate.verificationMethod.slice(0, -1), original.verificationMethod);
  assert.deepEqual(jwksCandidate.keys.slice(0, -1), originalJWKS.keys);
  for (const name of ["did.candidate.json", "jwks.candidate.json"]) {
    assert.equal((await stat(path.join(directory, name))).mode & 0o777, 0o600);
  }
  const second = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.notEqual(second.status, 0);
  assert.equal(await readFile(path.join(directory, "signing.env"), "utf8"), environment);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, "did.candidate.json"), "utf8")), candidate);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, "jwks.candidate.json"), "utf8")), jwksCandidate);
});

test("CLI requires explicit options and refuses secret output inside the repository", () => {
  const script = path.join(__dirname, "generate-did-keys.js");
  for (const args of [[],
    ["--output-dir", path.join(__dirname, "not-created"), "--key-id", keyId],
    ["--output-dir", path.join(tmpdir(), "not-created"), "--key-id", keyId, "--did-document", "unpaired.json"]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout);
  }
});
