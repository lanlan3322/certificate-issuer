const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const dotenv = require("dotenv");
const { Wallet, SigningKey } = require("ethers");
const { prepareDIDKeyMaterial } = require("../scripts/generate-did-keys");

const modules = new Map();
function load(filename) {
  const absolute = path.resolve(__dirname, filename);
  if (modules.has(absolute)) return modules.get(absolute).exports;
  const instance = new Module(absolute, module);
  instance.filename = absolute;
  instance.paths = Module._nodeModulePaths(path.dirname(absolute));
  const normalRequire = instance.require.bind(instance);
  instance.require = (specifier) => {
    if (specifier.startsWith(".") && !path.extname(specifier)) {
      return load(path.resolve(path.dirname(absolute), `${specifier}.ts`));
    }
    return normalRequire(specifier);
  };
  modules.set(absolute, instance);
  instance._compile(ts.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true },
  }).outputText, absolute);
  return instance.exports;
}
const {
  buildIssuerProfileDID,
  buildPublicDID,
  isRootDidWeb,
  publicDocumentHeaders,
} = load("did-publication.ts");
const didRoute = load("../app/api/.well-known/did/route.ts");
const jwksRoute = load("../app/api/.well-known/jwks/route.ts");
const historical = require("../public/.well-known/did.json");
const variables = ["DID_CONTROLLER", "DID_KEY_ID", "DID_PUBLIC_KEY_MULTIBASE",
  "NEXT_PUBLIC_DID_CONTROLLER", "NEXT_PUBLIC_DID_KEY_ID", "NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE"];

test("public DID/JWKS publication preserves history and publishes supported public keys", async (t) => {
  const previous = Object.fromEntries(variables.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test("issuer profile DID publication uses the profile key and supports root did:web hostnames only", async () => {
    const did = "did:web:fta.verifiable.sg";
    const method = `${did}#key-fta`;
    const keyReference = "FTA_SIGNING_KEY";
    const variables = [keyReference, `${keyReference}_PUBLIC_KEY_MULTIBASE`];
    const previous = Object.fromEntries(variables.map((name) => [name, process.env[name]]));
    try {
      process.env[`${keyReference}_PUBLIC_KEY_MULTIBASE`] =
        "zDnaeSTqh7zEbXfHYeEinKchU2jjZ5DQvDdKiQF5FRMV9dLbJ";

      assert.equal(isRootDidWeb(did), true);
      assert.equal(isRootDidWeb("did:web:fta.verifiable.sg:issuer"), false);
      assert.equal(isRootDidWeb("did:web:fta..verifiable.sg"), false);
      const publication = buildIssuerProfileDID({
        did,
        verificationMethod: method,
        keyReference,
      });
      assert.deepEqual(publication.document.assertionMethod, [method]);
      assert.equal(publication.document.id, did);
      assert.equal(publication.document.verificationMethod[0].publicKeyMultibase,
        process.env[`${keyReference}_PUBLIC_KEY_MULTIBASE`]);
      assert.equal(JSON.stringify(publication).includes(process.env[keyReference] ?? "\0"), false);
      assert.throws(() => buildIssuerProfileDID({
        did: "did:web:fta.verifiable.sg:issuer",
        verificationMethod: "did:web:fta.verifiable.sg:issuer#key-fta",
        keyReference,
      }), /root did:web hostname/);
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
  for (const name of variables) delete process.env[name];
  const baseline = buildPublicDID();
  assert.deepEqual(baseline.document, historical);
  assert.deepEqual(baseline.jwks, require("../public/.well-known/jwks.json"));

  const retainedMethod = historical.verificationMethod.find(
    (method) => method.id === `${historical.id}#ecdsa-2026-02`
  );
  const retiredId = `${historical.id}#ecdsa-2026-01`;
  const retiredKey = "zDnaep3QMCrSnAjtZmzZYbHGZyMttTq6FfjYXsC7fpE3EEzwo";
  assert.ok(!JSON.stringify(historical).includes(retiredKey) &&
    !JSON.stringify(historical).includes(retiredId), "retired key must not be published");
  assert.ok(retainedMethod, "reviewed static public method must be present");
  process.env.DID_CONTROLLER = historical.id;
  process.env.DID_KEY_ID = retainedMethod.id;
  process.env.DID_PUBLIC_KEY_MULTIBASE = retainedMethod.publicKeyMultibase;
  const retained = buildPublicDID();
  assert.deepEqual(retained, baseline, "already published method must not be duplicated");
  const { fromJwk: importPublicJWK } = await import("@digitalbazaar/ecdsa-multikey");
  const retainedJWK = retained.jwks.keys.find((key) => key.kid === "ecdsa-2026-02");
  const retainedKey = await importPublicJWK({ jwk: retainedJWK });
  assert.equal((await retainedKey.export({ publicKey: true })).publicKeyMultibase,
    retainedMethod.publicKeyMultibase, "static DID and JWKS must identify the same key");

  const id = `${historical.id}#ecdsa-publication-test`;
  const prepared = await prepareDIDKeyMaterial({ document: historical, keyId: id });
  const env = dotenv.parse(prepared.environment);
  for (const name of variables) {
    if (env[name]) process.env[name] = env[name];
  }
  const published = buildPublicDID();
  assert.deepEqual(published.document, prepared.candidate);
  assert.deepEqual(published.jwks, prepared.jwksCandidate);
  assert.deepEqual(published.document.verificationMethod.slice(0, -1), historical.verificationMethod);
  const jwk = published.jwks.keys.at(-1);
  assert.equal(jwk.crv, "P-256");
  assert.equal(jwk.kid, "ecdsa-publication-test");
  const { from, fromJwk } = await import("@digitalbazaar/ecdsa-multikey");
  const signer = await from({
    ...published.document.verificationMethod.at(-1),
    secretKeyMultibase: env.DID_PRIVATE_KEY_MULTIBASE,
  });
  const verifier = await fromJwk({ jwk });
  const data = new TextEncoder().encode("DID and JWKS represent the same signing key");
  const signature = await signer.signer().sign({ data });
  assert.equal(await verifier.verifier().verify({ data, signature }), true);
  assert.ok(!JSON.stringify(published).includes(env.DID_PRIVATE_KEY_MULTIBASE));

  for (const [route, expected] of [[didRoute, published.document], [jwksRoute, published.jwks]]) {
    const first = await route.GET(new Request("https://verifiable.sg/api/public"));
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), expected);
    const etag = first.headers.get("etag");
    assert.match(etag, /^"[a-f0-9]{64}"$/);
    const conditional = await route.GET(new Request("https://verifiable.sg/api/public", {
      headers: { "if-none-match": etag },
    }));
    assert.equal(conditional.status, 304);
    assert.equal(await conditional.text(), "");
    const replacement = await prepareDIDKeyMaterial({
      document: historical, keyId: id,
    });
    process.env.DID_PUBLIC_KEY_MULTIBASE =
      dotenv.parse(replacement.environment).DID_PUBLIC_KEY_MULTIBASE;
    const changed = await route.GET(new Request("https://verifiable.sg/api/public", {
      headers: { "if-none-match": etag },
    }));
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get("etag"), etag);
    process.env.DID_PUBLIC_KEY_MULTIBASE = env.DID_PUBLIC_KEY_MULTIBASE;
  }
  const headers = publicDocumentHeaders(published.document, "application/did+json");
  const changed = structuredClone(published.document);
  changed.service[0].serviceEndpoint = "https://example.test/verify";
  assert.notEqual(publicDocumentHeaders(changed, "application/did+json").ETag, headers.ETag);
  process.env.DID_KEY_ID = `${historical.id}#different-id`;
  assert.notEqual(publicDocumentHeaders(buildPublicDID().document, "application/did+json").ETag, headers.ETag);

  const { generate } = await import("@digitalbazaar/ecdsa-multikey");
  const p384 = await generate({ curve: "P-384", controller: historical.id, id });
  process.env.DID_KEY_ID = id;
  process.env.DID_PUBLIC_KEY_MULTIBASE =
    (await p384.export({ publicKey: true })).publicKeyMultibase;
  assert.equal(buildPublicDID().jwks.keys.at(-1).crv, "P-384");

  process.env.DID_KEY_ID = id;
  const point = SigningKey.computePublicKey(Wallet.createRandom().privateKey, false);
  for (const hex of [point, `0x${point.slice(4)}`]) {
    process.env.DID_PUBLIC_KEY_MULTIBASE = hex;
    const key = buildPublicDID().jwks.keys.at(-1);
    assert.equal(key.crv, "secp256k1");
    assert.equal(key.x, Buffer.from(point.slice(4, 68), "hex").toString("base64url"));
    assert.equal(key.y, Buffer.from(point.slice(68), "hex").toString("base64url"));
  }

  const errors = t.mock.method(console, "error", () => {});
  for (const [keyId, publicKey] of [
    [historical.id, env.DID_PUBLIC_KEY_MULTIBASE],
    [`${historical.id}#key-1`, env.DID_PUBLIC_KEY_MULTIBASE],
    [`${historical.id}#ecdsa-2026-01`, "zDnaep3QMCrSnAjtZmzZYbHGZyMttTq6FfjYXsC7fpE3EEzwo"],
    [id, "zDnaep3QMCrSnAjtZmzZYbHGZyMttTq6FfjYXsC7fpE3EEzwo"],
    [id, "zInvalid0"],
    [id, "0x1234"],
    [id, `0x04${"00".repeat(64)}`],
  ]) {
    process.env.DID_KEY_ID = keyId;
    process.env.DID_PUBLIC_KEY_MULTIBASE = publicKey;
    assert.throws(() => buildPublicDID());
    for (const route of [didRoute, jwksRoute]) {
      const response = await route.GET(new Request("https://example.test/api/public"));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match((await response.json()).error, /not configured correctly/);
    }
  }
  assert.equal(errors.mock.callCount(), 14, "each invalid route response must log its error");
});
