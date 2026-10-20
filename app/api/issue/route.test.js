const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");

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

function createRoute({ statusProfile = "legacy", profileMapped = true, registrationError = false } = {}) {
  const calls = [];
  const pending = [];
  const defaultStore = {
    address: "0x814D9c222D3b5A8282e0467Fa12b24C057731dD6",
    network: "sepolia",
  };
  const profile = {
    id: "profile-id",
    ownerIssuerId: "issuer-id",
    issuerName: "FTA Academy",
    displayName: "FTA Academy",
    did: "did:web:fta.verifiable.sg",
    verificationMethod: "did:web:fta.verifiable.sg#key-1",
    documentStoreAddress: "0x0000000000000000000000000000000000000001",
    documentStoreNetwork: "sepolia",
    active: true,
    keyReference: "FTA_SIGNING_KEY",
  };
  const keyPair = {
    id: profile.verificationMethod,
    controller: profile.did,
    publicKeyMultibase: "zPublic",
    secretKeyMultibase: "zSecret",
  };
  const mocks = {
    "next/server": { NextResponse, after: (callback) => pending.push(callback) },
    "../../../lib/apiAuth": {
      authorize: async () => ({
        user: { id: "user-id", issuerId: "issuer-id", organizationId: "org-id" },
      }),
      errorResponse: (error, fallback, status = 500) =>
        NextResponse.json({ error: error?.message ?? fallback }, { status }),
    },
    "../../../lib/trustvc": {
      computeDocumentStoreHash: () => `0x${"b".repeat(64)}`,
      buildVCPayload: (data) => {
        calls.push(["payload", data]);
        return {
          issuer: data.issuerDid ?? "did:web:verifiable.sg",
          credentialSubject: { issuerDisplayName: data.issuerDisplayName },
          credentialStatus: [{
            id: `did:ethr:${data.documentStoreAddress ?? "legacy"}#external-id`,
            targetHash: `0x${"a".repeat(64)}`,
          }],
        };
      },
      getDIDKeyPairFromEnv: () => {
        calls.push(["legacy-key"]);
        return {};
      },
      getDIDKeyPairFromIssuerProfile: (input) => {
        calls.push(["profile-key", input]);
        return keyPair;
      },
      signDocumentWithDID: async (credential, secret, context) => {
        calls.push(["sign", credential, secret, context]);
        return { signed: true, credential: { ...credential, proof: { verificationMethod: context?.verificationMethod } } };
      },
      withEmbeddedRenderMethod: (credential) => credential,
    },
    "../../templates/registry": { resolveTemplateId: (id) => id ?? "classic" },
    "../../../services/AuditService": { AuditService: { record: async (event) => calls.push(["audit", event]) } },
    "../../../services/CredentialService": {
      DuplicateCredentialError: class extends Error {},
      CredentialService: {
        create: async (input) => {
          calls.push(["persist", input]);
          return { id: "credential-row-id" };
        },
      },
    },
    "../../../services/IssuerProfileService": {
      IssuerProfileService: { get: async (id, issuerId) => {
        calls.push(["load-profile", id, issuerId]);
        return profile;
      } },
    },
    "../../../services/TemplateService": {
      TemplateService: { getForIssuance: async (reference, issuerId) => {
        calls.push(["load-template", reference, issuerId]);
        return {
          id: "template-row-id",
          issuerId,
          issuerProfileId: profileMapped ? "profile-id" : null,
          isActive: true,
        };
      } },
    },
    "../../../lib/document-store": {
      getDefaultDocumentStoreConfig: () => defaultStore,
      isRegistered: () => true,
      registerHash: async (...args) => {
        calls.push(["register-store", ...args]);
        if (!registrationError) await args[3]("0xregistration");
        return registrationError
          ? { hashExists: false, registered: false, error: "Registration failed" }
          : { hashExists: true, registered: true, txHash: "0xregistration" };
      },
    },
    "../../../lib/constants": { NETWORKS: { sepolia: {}, mainnet: {} } },
    "../../../services/StatusListService": {
      requireStatusListConfiguration: (profile) => calls.push(["require-status-list", profile]),
      StatusListService: { reserve: async (...args) => {
        calls.push(["reserve-status", ...args]);
        return [{
          id: "https://fta.verifiable.sg/api/status-list/0/revocation#0",
          type: "BitstringStatusListEntry",
          statusPurpose: "revocation",
          statusListIndex: "0",
          statusListCredential: "https://fta.verifiable.sg/api/status-list/0/revocation",
        }];
      } },
    },
  };
  const route = load(mocks);
  const data = {
    id: "external-id",
    recipientName: "Test Recipient",
    recipientEmail: "recipient@example.com",
    certificateType: "Completion",
    templateId: "fta",
    issuerName: "untrusted client name",
    issuerDid: "did:web:attacker.example",
    issuerDisplayName: "Attacker",
    documentStoreAddress: "0x0000000000000000000000000000000000000002",
    issueDate: "2026-10-20",
    description: "",
    validFrom: "2026-10-20T00:00:00Z",
    issuingMethods: ["did"],
  };
  const post = (overrides = {}) => route.POST(new Request("https://verifiable.sg/api/issue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      data,
      templateId: "template-row-id",
      statusProfile,
      ...overrides,
    }),
  }));
  return { post, calls, profile, defaultStore, finish: async () => {
    for (const callback of pending) await callback();
  } };
}

test("issue route signs and persists using the selected template issuer profile", async () => {
  const { post, calls, profile, finish } = createRoute();
  const response = await post();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.signed, true);

  const payload = calls.find(([name]) => name === "payload")[1];
  assert.equal(payload.issuerDid, profile.did);
  assert.equal(payload.issuerDisplayName, profile.displayName);
  assert.equal(payload.issuerName, profile.displayName);
  assert.equal(payload.documentStoreAddress, profile.documentStoreAddress);

  const signing = calls.find(([name]) => name === "sign");
  assert.equal(signing[2], undefined);
  assert.deepEqual(signing[3], {
    did: profile.did,
    verificationMethod: profile.verificationMethod,
    publicKeyMultibase: "zPublic",
    secretKeyMultibase: "zSecret",
  });
  assert.equal(calls.some(([name]) => name === "legacy-key"), false);

  const stored = calls.find(([name]) => name === "persist")[1];
  assert.equal(stored.templateId, "template-row-id");
  assert.equal(stored.issuerProfileId, profile.id);
  assert.equal(stored.issuerDid, profile.did);
  assert.equal(stored.verificationMethod, profile.verificationMethod);
  assert.equal(stored.documentStoreAddress, profile.documentStoreAddress);
  assert.equal(stored.documentStoreNetwork, profile.documentStoreNetwork);
  assert.equal(stored.documentHash, `0x${"a".repeat(64)}`);
  assert.equal(calls.some(([name]) => name === "register-store"), false);
  await finish();
  const registration = calls.find(([name]) => name === "register-store");
  assert.equal(registration[3].address, profile.documentStoreAddress);
  assert.equal(registration[3].network, profile.documentStoreNetwork);
});

test("profile-specific Bitstring status is allocated against the selected issuer profile", async () => {
  const { post, calls } = createRoute({ statusProfile: "bitstring" });
  const response = await post();
  assert.equal(response.status, 200);
  assert.ok(calls.some(([name]) => name === "reserve-status"));
  assert.deepEqual(calls.find(([name]) => name === "reserve-status").slice(1), [
    "issuer-id",
    "external-id",
    {
      id: "profile-id",
      did: "did:web:fta.verifiable.sg",
      verificationMethod: "did:web:fta.verifiable.sg#key-1",
      keyReference: "FTA_SIGNING_KEY",
    },
  ]);
  assert.ok(calls.some(([name]) => name === "sign"));
});

test("unmapped templates ignore client-supplied DID, display name, and Document Store", async () => {
  const { post, calls, defaultStore, finish } = createRoute({ profileMapped: false });
  const response = await post();
  assert.equal(response.status, 200);
  const payload = calls.find(([name]) => name === "payload")[1];
  assert.equal(payload.issuerDid, undefined);
  assert.equal(payload.issuerDisplayName, undefined);
  assert.equal(payload.documentStoreAddress, defaultStore.address);
  assert.equal(payload.documentStoreNetwork, defaultStore.network);
  assert.equal(calls.some(([name]) => name === "profile-key"), false);
  assert.equal(calls.find(([name]) => name === "sign")[3], undefined);
  await finish();
  assert.deepEqual(calls.find(([name]) => name === "register-store")[3], defaultStore);
});

test("post-response registration persists txHash and selected store in the existing audit log", async () => {
  const { post, calls, finish, profile } = createRoute();
  assert.equal((await post()).status, 200);
  await finish();
  const submitted = calls.find(([name, event]) => name === "audit" && event.action === "credential.registration_submitted")[1];
  assert.equal(submitted.metadata.txHash, "0xregistration");
  const event = calls.find(([name, event]) => name === "audit" && event.action === "credential.registered")[1];
  assert.equal(event.entityId, "credential-row-id");
  assert.equal(event.metadata.txHash, "0xregistration");
  assert.equal(event.metadata.targetHash, `0x${"a".repeat(64)}`);
  assert.equal(event.metadata.documentStoreAddress, profile.documentStoreAddress);
});

test("failed registration does not fail issuance and is recorded explicitly", async () => {
  const { post, calls, finish } = createRoute({ registrationError: true });
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).signed, true);
  await finish();
  const event = calls.find(([name, event]) => name === "audit" && event.action === "credential.registration_failed")[1];
  assert.equal(event.metadata.error, "Registration failed");
});

test("issuer-profile issuance cannot skip persistence of its identity snapshots", async () => {
  const { post, calls } = createRoute();
  const response = await post({ persist: false });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /must be persisted/);
  assert.equal(calls.some(([name]) => name === "sign" || name === "persist"), false);
});

test("TrustVC dual issuance uses signed status lists and persists separate blockchain hash metadata", async () => {
  const { post, calls, finish } = createRoute({ statusProfile: "trustvc" });
  const response = await post({ data: {
    id: "external-id", recipientName: "Test", recipientEmail: "test@example.com",
    certificateType: "Completion", issuingMethods: ["did", "ethereum"],
  } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.blockchainRegistration, "scheduled");
  assert.deepEqual(calls.find(([name]) => name === "payload")[1].issuingMethods, ["did"]);
  assert.equal(result.credential.credentialStatus[0].type, "BitstringStatusListEntry");
  assert.equal(result.credential.credentialStatus[0].targetHash, undefined);
  const record = calls.find(([name]) => name === "persist")[1];
  assert.equal(record.documentHash, `0x${"b".repeat(64)}`);
  assert.deepEqual(record.issuingMethods, ["did", "ethereum"]);
  await finish();
  assert.equal(calls.find(([name]) => name === "register-store")[1], record.documentHash);
});

test("TrustVC DID-only issuance signs list status without scheduling a blockchain registration", async () => {
  const { post, calls, finish } = createRoute({ statusProfile: "trustvc" });
  const response = await post();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.credential.credentialStatus[0].type, "BitstringStatusListEntry");
  assert.equal(result.blockchainRegistration, undefined);
  assert.equal(calls.find(([name]) => name === "persist")[1].documentHash, undefined);
  await finish();
  assert.equal(calls.some(([name]) => name === "register-store"), false);
});

test("TrustVC profile rejects non-persisted or Ethereum-only issuance before signing", async () => {
  for (const overrides of [
    { persist: false },
    { data: { id: "external-id", recipientName: "Test", recipientEmail: "test@example.com",
      certificateType: "Completion", issuingMethods: ["ethereum"] } },
  ]) {
    const { post, calls } = createRoute({ statusProfile: "trustvc" });
    const response = await post(overrides);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /persisted DID issuance/);
    assert.equal(calls.some(([name]) => name === "sign" || name === "persist"), false);
  }
});
