const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");

function load(relative, mocks) {
  const filename = path.resolve(__dirname, relative);
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

test("status service is disabled by default, validates configuration and propagates RPC/signing failures", async (t) => {
  const names = ["ENABLE_BITSTRING_STATUS_LIST", "STATUS_LIST_BASE_URL"];
  const previous = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, index) => {
    if (previous[index] === undefined) delete process.env[name];
    else process.env[name] = previous[index];
  }));
  const calls = [];
  let result = { data: 0, error: null };
  let signed = true;
  const { StatusListService: service } = load("StatusListService.ts", {
    "./CredentialService": { DuplicateCredentialError: class extends Error {} },
    "../lib/supabase/server": { getSupabaseAdmin: () => ({
      rpc: async (...args) => { calls.push(args); return result; },
    }) },
    "../lib/did-utils": { resolveDIDController: () => "did:web:verifiable.sg" },
    "../lib/did-publication": { isRootDidWeb: (did) => /^did:web:[a-z0-9.-]+$/.test(did) },
    "./IssuerProfileService": { IssuerProfileService: { getForPublicDID: async () => null } },
    "../lib/bitstring-status": {
      statusListURL: (base) => {
        if (!base.startsWith("https://")) throw new Error("Invalid HTTPS origin");
        return `${base}/api/status-list/0/revocation`;
      },
      createBitstringEntries: (_, index) => [{ type: "BitstringStatusListEntry", index }],
      createStatusListDocument: async (_, issuer, purpose, entries) => ({ issuer, purpose, entries }),
    },
    "../lib/trustvc": {
      getDIDKeyPairFromIssuerProfile: () => null,
      signDocumentWithDID: async (document) => ({
        signed, credential: document, error: signed ? undefined : "test signing failure",
      }),
    },
  });
  delete process.env.ENABLE_BITSTRING_STATUS_LIST;
  await assert.rejects(service.reserve("issuer", "external"), /not enabled/);
  assert.equal(calls.length, 0);
  process.env.ENABLE_BITSTRING_STATUS_LIST = "true";
  delete process.env.STATUS_LIST_BASE_URL;
  await assert.rejects(service.reserve("issuer", "external"), /required/);
  for (const base of ["http://verifiable.sg", "https://other.example", "https://verifiable.sg/path"]) {
    process.env.STATUS_LIST_BASE_URL = base;
    await assert.rejects(service.reserve("issuer", "external"));
  }
  assert.equal(calls.length, 0);
  process.env.STATUS_LIST_BASE_URL = "https://verifiable.sg";
  assert.deepEqual(await service.reserve("issuer", "external"),
    [{ type: "BitstringStatusListEntry", index: 0 }]);
  assert.deepEqual(calls[0], ["reserve_bitstring_status", { p_issuer: "issuer", p_external: "external" }]);
  result = { data: null, error: new Error("migration missing") };
  await assert.rejects(service.reserve("issuer", "external"), /migration missing/);
  for (const invalid of [null, false, "", -1, "9007199254740992"]) {
    result = { data: invalid, error: null };
    await assert.rejects(service.reserve("issuer", "external"), /safe index/);
  }
  result = { data: null, error: null };
  assert.equal(await service.publish(0, "revocation"), null);
  result = { data: [{ index: 0, status: "issued" }], error: null };
  assert.equal((await service.publish(0, "revocation")).entries[0].status, "issued");
  signed = false;
  await assert.rejects(service.publish(0, "revocation"), /test signing failure/);
  result = { data: [{ index: 0, status: "unknown" }], error: null };
  await assert.rejects(service.publish(0, "revocation"), /snapshot entry/);
});

test("profile status lists allocate, publish and sign with the selected issuer DID and key", async (t) => {
  const previousEnabled = process.env.ENABLE_BITSTRING_STATUS_LIST;
  t.after(() => {
    if (previousEnabled === undefined) delete process.env.ENABLE_BITSTRING_STATUS_LIST;
    else process.env.ENABLE_BITSTRING_STATUS_LIST = previousEnabled;
  });
  process.env.ENABLE_BITSTRING_STATUS_LIST = "true";
  const calls = [];
  const profile = {
    id: "profile-id",
    did: "did:web:fta.verifiable.sg",
    verificationMethod: "did:web:fta.verifiable.sg#key-fta",
    keyReference: "FTA_SIGNING_KEY",
  };
  const keyPair = {
    controller: profile.did,
    id: profile.verificationMethod,
    publicKeyMultibase: "zPublic",
    secretKeyMultibase: "zSecret",
  };
  const { StatusListService: service } = load("StatusListService.ts", {
    "./CredentialService": { DuplicateCredentialError: class extends Error {} },
    "../lib/supabase/server": { getSupabaseAdmin: () => ({
      rpc: async (name, input) => {
        calls.push(["rpc", name, input]);
        return { data: name.startsWith("reserve_") ? 5 : [{ index: 5, status: "issued" }], error: null };
      },
    }) },
    "../lib/did-utils": { resolveDIDController: () => "did:web:verifiable.sg" },
    "../lib/did-publication": { isRootDidWeb: (did) => /^did:web:[a-z0-9.-]+$/.test(did) },
    "./IssuerProfileService": {
      IssuerProfileService: { getForPublicDID: async (did) => {
        calls.push(["lookup-profile", did]);
        return did === profile.did ? profile : null;
      } },
    },
    "../lib/bitstring-status": {
      statusListURL: (base, page, purpose) => `${base}/api/status-list/${page}/${purpose}`,
      createBitstringEntries: (base, index) => {
        calls.push(["entries", base, index]);
        return [{ statusListCredential: `${base}/api/status-list/0/revocation` }];
      },
      createStatusListDocument: async (url, issuer, purpose, entries) => ({
        id: url, issuer, purpose, credentialSubject: { entries },
      }),
    },
    "../lib/trustvc": {
      getDIDKeyPairFromIssuerProfile: (input) => {
        calls.push(["load-key", input]);
        return keyPair;
      },
      signDocumentWithDID: async (document, secret, context) => {
        calls.push(["sign", document, secret, context]);
        return { signed: true, credential: { ...document, proof: {} } };
      },
    },
  });

  const allocated = await service.reserve("issuer-id", "cert-id", profile);
  assert.deepEqual(allocated, [{
    statusListCredential: "https://fta.verifiable.sg/api/status-list/0/revocation",
  }]);
  assert.deepEqual(calls[0], ["rpc", "reserve_profile_bitstring_status", {
    p_issuer: "issuer-id", p_profile: "profile-id", p_external: "cert-id",
  }]);
  assert.deepEqual(calls[1], ["entries", "https://fta.verifiable.sg", 5]);

  const published = await service.publish(0, "revocation", profile.did);
  assert.equal(published.issuer, profile.did);
  assert.equal(published.id, "https://fta.verifiable.sg/api/status-list/0/revocation");
  assert.deepEqual(calls.find((call) => call[0] === "rpc" && call[1] === "read_profile_bitstring_status"), [
    "rpc", "read_profile_bitstring_status", { p_page: 0, p_profile: "profile-id" },
  ]);
  assert.deepEqual(calls.find((call) => call[0] === "sign")[3], {
    did: profile.did,
    verificationMethod: profile.verificationMethod,
    publicKeyMultibase: "zPublic",
    secretKeyMultibase: "zSecret",
  });
});

test("public list route validates identifiers and returns signed credentials or explicit no-store errors", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  let value = { id: "https://verifiable.sg/api/status-list/0/revocation", proof: { type: "DataIntegrityProof" } };
  let fail = false;
  const calls = [];
  const route = load("../app/api/status-list/[page]/[purpose]/route.ts", {
    "../../../../../services/StatusListService": { StatusListService: {
      publish: async (...args) => {
        calls.push(args);
        if (fail) throw new Error("test unavailable");
        return value;
      },
    } },
  });
  const get = (page = "0", purpose = "revocation", host = "verifiable.sg") => route.GET(
    new Request(`https://${host}/api/status-list`),
    { params: Promise.resolve({ page, purpose }) }
  );
  for (const [page, purpose] of [["-1", "revocation"], ["01", "revocation"],
    ["2147483648", "revocation"], ["0", "unknown"]]) {
    const response = await get(page, purpose);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls.length, 0);
  const active = await get();
  assert.equal(active.status, 200);
  assert.equal(active.headers.get("content-type"), "application/vc+ld+json");
  assert.deepEqual(await active.json(), value);
  const profileList = await get("0", "suspension", "fta.verifiable.sg");
  assert.equal(profileList.status, 200);
  assert.deepEqual(calls, [
    [0, "revocation", "did:web:verifiable.sg"],
    [0, "suspension", "did:web:fta.verifiable.sg"],
  ]);
  value = null;
  assert.equal((await get()).status, 404);
  fail = true;
  const unavailable = await get();
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  assert.equal(errors.mock.callCount(), 1);
});

test("issuance route preserves default status and requires persisted DID-only opt-in", async () => {
  const legacy = [{ type: "OpenAttestationDocumentStore" }];
  const bitstring = [{ type: "BitstringStatusListEntry" }];
  const calls = { reserve: 0, persist: 0, configuration: 0, audit: 0 };
  let enabled = true;
  const route = load("../app/api/issue/route.ts", {
    "../../../lib/apiAuth": {
      authorize: async () => ({ user: { id: "user", issuerId: "issuer", organizationId: "org" } }),
      errorResponse: (error, _, status) => NextResponse.json({ error: error.message }, { status }),
    },
    "../../../lib/trustvc": {
      buildVCPayload: () => ({ credentialStatus: legacy }),
      getDIDKeyPairFromEnv: () => ({}),
      getDIDKeyPairFromIssuerProfile: () => null,
      signDocumentWithDID: async (document) => ({ signed: true, credential: { ...document, proof: {} } }),
      withEmbeddedRenderMethod: (document, templateName) => ({ ...document,
        renderMethod: [{ type: "EMBEDDED_RENDERER", templateName }] }),
    },
    "../../templates/registry": { resolveTemplateId: (id) => id ?? "classic" },
    "../../../lib/constants": { NETWORKS: { sepolia: {}, mainnet: {} } },
    "../../../services/AuditService": { AuditService: { record: async () => { calls.audit++; } } },
    "../../../services/IssuerProfileService": { IssuerProfileService: { get: async () => null } },
    "../../../services/TemplateService": { TemplateService: { getForIssuance: async () => null } },
    "../../../services/CredentialService": {
      DuplicateCredentialError: class extends Error {},
      CredentialService: { create: async () => { calls.persist++; return { id: "stored" }; } },
    },
    "../../../lib/document-store": {
      isRegistered: () => false,
      getDefaultDocumentStoreConfig: () => ({
        address: "0x814D9c222D3b5A8282e0467Fa12b24C057731dD6", network: "sepolia",
      }),
    },
    "../../../services/StatusListService": {
      requireStatusListConfiguration: () => {
        calls.configuration++;
        if (!enabled) throw new Error("not enabled");
      },
      StatusListService: { reserve: async () => { calls.reserve++; return bitstring; } },
    },
  });
  const data = { id: "test", recipientName: "Test", recipientEmail: "test@example.com",
    certificateType: "ProfessionalCertificate", issuingMethods: ["did"] };
  const post = (body) => route.POST(new Request("https://verifiable.sg/api/issue", {
    method: "POST", body: JSON.stringify({ data, ...body }),
  }));
  assert.deepEqual((await (await post({})).json()).credential.credentialStatus, legacy);
  assert.equal(calls.configuration, 0);
  assert.equal(calls.reserve, 0);
  const optedIn = await post({ statusProfile: "bitstring" });
  assert.equal(optedIn.status, 200);
  assert.deepEqual((await optedIn.json()).credential.credentialStatus, bitstring);
  assert.equal(calls.reserve, 1);
  assert.equal(calls.persist, 2);
  assert.equal(calls.audit, 2);
  for (const body of [{ statusProfile: "bad" }, { statusProfile: "bitstring", persist: false },
    { statusProfile: "bitstring", data: { ...data, issuingMethods: ["ethereum"] } },
    { statusProfile: "bitstring", data: { ...data, issuingMethods: ["did", "ethereum"] } }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(calls.reserve, 1);
  assert.equal((await (await post({})).json()).credential.renderMethod, undefined);
  const rendered = await post({ renderMethod: "embedded", templateId: "fta" });
  assert.equal(rendered.status, 200);
  assert.deepEqual((await rendered.json()).credential.renderMethod,
    [{ type: "EMBEDDED_RENDERER", templateName: "fta" }]);
  assert.equal((await post({ renderMethod: "bad" })).status, 400);
  assert.equal((await post({ renderMethod: "embedded",
    data: { ...data, issuingMethods: ["ethereum"] } })).status, 400);
  enabled = false;
  assert.equal((await post({ statusProfile: "bitstring" })).status, 500);
  assert.equal(calls.reserve, 1);
});

test("revocation service uses atomic RPC only for opt-in credentials and preserves legacy updates", async () => {
  let storedDocument = JSON.stringify({ credentialStatus: [{ type: "BitstringStatusListEntry" }] });
  const calls = [];
  const server = { from: (table) => {
    calls.push(table);
    const chain = {
      select: () => chain, eq: () => chain,
      maybeSingle: async () => ({ data: { id: "db-id", status: "issued",
        external_id: "external", credential: storedDocument }, error: null }),
      insert: () => chain,
      single: async () => ({ data: { id: "log" }, error: null }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    };
    return chain;
  } };
  const { RevocationService: service } = load("RevocationService.ts", {
    "../lib/supabase/server": {
      getSupabaseServerClient: async () => server,
      getSupabaseAdmin: () => ({ rpc: async (name, input) => {
        calls.push([name, input]);
        return { data: { id: "log", credential_id: "db-id", issuer_id: "issuer",
          action: "revoke", external_id: "external", credential_status: "revoked" }, error: null };
      } }),
    },
    "../lib/document-store": {
      revokeHash: async () => ({ txHash: "0xprofile-store-tx", alreadyRevoked: false }),
    },
  });
  const input = { credentialRef: "external", issuerId: "issuer", action: "revoke", reason: "test" };
  assert.equal((await service.apply(input)).credentialStatus, "revoked");
  assert.equal(calls[1][0], "apply_bitstring_revocation");
  assert.equal(calls[1][1].p_issuer, "issuer");
  assert.equal(calls.includes("revocations"), false);
  calls.length = 0;
  storedDocument = { credentialStatus: [{ type: "OpenAttestationDocumentStore" }] };
  assert.equal((await service.apply(input)).credentialStatus, "revoked");
  assert.deepEqual(calls, ["credentials", "revocations", "credentials"]);
});
