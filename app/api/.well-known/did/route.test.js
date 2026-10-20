const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(mocks) {
  const filename = path.resolve(__dirname, "route.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : normalRequire(name);
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true },
  }).outputText, filename);
  return instance.exports;
}

test("public DID API publishes legacy and host-selected profile documents", async () => {
  const calls = [];
  const legacy = { id: "did:web:verifiable.sg", assertionMethod: ["legacy-key"] };
  const profileDoc = { id: "did:web:fta.verifiable.sg", assertionMethod: ["fta-key"] };
  let failProfilePublication = false;
  const { GET } = load({
    "../../../../lib/did-publication": {
      buildIssuerProfileDID: (profile) => {
        calls.push(["build-profile", profile]);
        if (failProfilePublication) throw new Error("public key unavailable");
        return { document: profileDoc };
      },
      buildPublicDID: () => ({ document: legacy }),
      LEGACY_DID_ID: legacy.id,
      publicDocumentHeaders: (document, contentType) => ({
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        ETag: `"${document.id}"`,
      }),
    },
    "../../../../services/IssuerProfileService": {
      IssuerProfileService: {
        getForPublicDID: async (did) => {
          calls.push(["lookup", did]);
          return did === profileDoc.id ? {
            did: profileDoc.id,
            verificationMethod: "did:web:fta.verifiable.sg#key-fta",
            keyReference: "FTA_SIGNING_KEY",
          } : null;
        },
      },
    },
  });

  const profile = await GET(new Request("https://fta.verifiable.sg/api/.well-known/did"));
  assert.equal(profile.status, 200);
  assert.equal(profile.headers.get("content-type"), "application/did+json");
  assert.equal(profile.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await profile.json(), profileDoc);
  assert.deepEqual(calls, [
    ["lookup", profileDoc.id],
    ["build-profile", {
      did: profileDoc.id,
      verificationMethod: "did:web:fta.verifiable.sg#key-fta",
      keyReference: "FTA_SIGNING_KEY",
    }],
  ]);

  const forwarded = await GET(new Request("http://internal/api/.well-known/did", {
    headers: { "x-forwarded-host": "fta.verifiable.sg, internal.example" },
  }));
  assert.deepEqual(await forwarded.json(), profileDoc);

  const cached = await GET(new Request("https://fta.verifiable.sg/api/.well-known/did", {
    headers: { "if-none-match": `"${profileDoc.id}"` },
  }));
  assert.equal(cached.status, 304);

  const legacyResponse = await GET(new Request("https://verifiable.sg/api/.well-known/did"));
  assert.deepEqual(await legacyResponse.json(), legacy);

  const missing = await GET(new Request("https://unknown.verifiable.sg/api/.well-known/did"));
  assert.equal(missing.status, 404);

  failProfilePublication = true;
  const errors = test.mock.method(console, "error", () => {});
  const invalid = await GET(new Request("https://fta.verifiable.sg/api/.well-known/did"));
  assert.equal(invalid.status, 503);
  assert.equal(invalid.headers.get("cache-control"), "no-store");
  assert.equal(errors.mock.callCount(), 1);
});
