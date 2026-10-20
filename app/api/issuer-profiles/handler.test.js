const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");

class IssuerProfileIdentityLockedError extends Error {
  constructor() {
    super("Issuer profile DID and signing key cannot change after first use.");
  }
}

function load(mocks) {
  const filename = path.resolve(__dirname, "handler.ts");
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

test("issuer profile API scopes callers, redacts key references, and accepts references rather than keys", async () => {
  const roles = [];
  let userRoles = ["issuer-admin"];
  const records = [{
    id: "profile", ownerIssuerId: "issuer", issuerName: "FTA Academy",
    displayName: "FTA Academy", did: "did:web:fta.verifiable.sg",
    verificationMethod: "did:web:fta.verifiable.sg#key-1", keyReference: "FTA_SIGNING_KEY",
    active: true, createdAt: "now", updatedAt: "now",
  }];
  const calls = [];
  const service = {
    list: async (issuerId, options) => {
      calls.push(["list", issuerId, options]);
      return records;
    },
    create: async (input) => {
      calls.push(["create", input]);
      return { id: "new-profile", ...input, createdAt: "now", updatedAt: "now" };
    },
    update: async (id, issuerId, input) => {
      if (id === "locked") throw new IssuerProfileIdentityLockedError();
      return { id, ownerIssuerId: issuerId, ...input };
    },
  };
  const mocks = {
    "../../../lib/apiAuth": {
      authorize: async (role) => {
        roles.push(role);
        return { user: { id: "user", issuerId: "issuer", organizationId: "org", roles: userRoles } };
      },
      errorResponse: (error, fallback) => NextResponse.json({ error: error?.message ?? fallback }, { status: 500 }),
    },
    "../../../services/AuditService": { AuditService: { record: async () => {} } },
    "../../../services/IssuerProfileService": {
      IssuerProfileService: service,
      IssuerProfileIdentityLockedError,
    },
    "../../../lib/did-publication": {
      isRootDidWeb: (did) => /^did:web:[a-z0-9.-]+$/.test(did),
      LEGACY_DID_ID: "did:web:verifiable.sg",
    },
  };
  const route = load(mocks);
  const listed = await route.GET(new Request("https://verifiable.sg/api/issuer-profiles"));
  assert.equal(listed.status, 200);
  const listPayload = await listed.json();
  assert.equal(listPayload.issuerProfiles[0].displayName, "FTA Academy");
  assert.equal(listPayload.canManage, true);
  assert.equal("keyReference" in listPayload.issuerProfiles[0], false);
  assert.deepEqual(calls[0], ["list", "issuer", { includeInactive: false }]);

  userRoles = [];
  const readOnly = await route.GET(new Request("https://verifiable.sg/api/issuer-profiles"));
  assert.equal((await readOnly.json()).canManage, false);
  userRoles = ["issuer-admin"];

  const body = {
    issuerName: "FTA Academy",
    displayName: "FTA Academy",
    did: "did:web:fta.verifiable.sg",
    verificationMethod: "did:web:fta.verifiable.sg#key-1",
    keyReference: "FTA_SIGNING_KEY",
  };
  const created = await route.POST(new Request("https://verifiable.sg/api/issuer-profiles", {
    method: "POST", body: JSON.stringify(body),
  }));
  assert.equal(created.status, 201);
  assert.equal(roles.at(-1), "issuer-admin");
  const createCall = calls.find(([method]) => method === "create");
  assert.equal(createCall[1].keyReference, "FTA_SIGNING_KEY");
  assert.equal("privateKey" in createCall[1], false);

  const unsafe = await route.POST(new Request("https://verifiable.sg/api/issuer-profiles", {
    method: "POST", body: JSON.stringify({ ...body, keyReference: "0x123456789abcdef" }),
  }));
  assert.equal(unsafe.status, 400);
  assert.equal(calls.filter(([method]) => method === "create").length, 1);

  const unsafeWebsite = await route.POST(new Request("https://verifiable.sg/api/issuer-profiles", {
    method: "POST", body: JSON.stringify({ ...body, website: "javascript:alert(1)" }),
  }));
  assert.equal(unsafeWebsite.status, 400);
  assert.equal(calls.filter(([method]) => method === "create").length, 1);

  const mismatched = await route.POST(new Request("https://verifiable.sg/api/issuer-profiles", {
    method: "POST", body: JSON.stringify({
      ...body,
      verificationMethod: "did:web:other.verifiable.sg#key-1",
    }),
  }));
  assert.equal(mismatched.status, 400);

  const partialDid = await route.PATCH(new Request("https://verifiable.sg/api/issuer-profiles", {
    method: "PATCH",
    body: JSON.stringify({ id: "profile", did: "did:web:new.verifiable.sg" }),
  }));
  assert.equal(partialDid.status, 400);
  assert.match((await partialDid.json()).error, /updated together/);

  const reservedDid = await route.POST(new Request("https://verifiable.sg/api/issuer-profiles", {
    method: "POST",
    body: JSON.stringify({
      ...body,
      did: "did:web:verifiable.sg",
      verificationMethod: "did:web:verifiable.sg#profile-key",
    }),
  }));
  assert.equal(reservedDid.status, 400);

  const lockedUpdate = await route.PATCH(new Request("https://verifiable.sg/api/issuer-profiles", {
    method: "PATCH",
    body: JSON.stringify({ id: "locked", displayName: "New name" }),
  }));
  assert.equal(lockedUpdate.status, 409);
  assert.match((await lockedUpdate.json()).error, /cannot change after first use/);
});
