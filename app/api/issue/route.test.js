const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");
const managedDid="did:web:verifiable.sg:organizations:academy";
const managedMethod=`${managedDid}#issuer-issuer-id-key-1`;

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

function createRoute({ statusProfile = "legacy", profileMapped = true, registrationError = false, registrationEnabled = true, templateOwner = "issuer-id", roles = ["issuer-operator"], available = true } = {}) {
  const calls = [];
  const pending = [];
  const defaultStore = {
    address: "0x814D9c222D3b5A8282e0467Fa12b24C057731dD6",
    network: "sepolia",
  };
  const profile = {
    id: "profile-id",
    ownerIssuerId: "issuer-id",
    issuerName: "Fintech Academy",
    displayName: "Fintech Academy",
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
    "../../../lib/issuer-key-crypto":{IssuerKeyError:class extends Error{}},
    "../../../services/ManagedDIDService":{ManagedDIDError:class extends Error{}},
    "../../../services/IssuerKeyService":{IssuerKeyService:{signer:async(id,expected)=>{
      calls.push(["issuer-owned-key",id,expected]);
      return {did:managedDid,
        verificationMethod:managedMethod,
        publicKeyMultibase:"zPublic",secretKeyMultibase:"zSecret"};
    }}},
    "../../../lib/issuer-access": { requireIssuerAccess: async (_user, id) => {
      if (id !== "issuer-id" && !roles.includes("platform-admin")) throw new Error("Issuer access denied.");
      return { id, organizationId: "org-id", displayName: "Fintech Academy", active: true };
    } },
    "../../../services/OrganizationService": { OrganizationService: {
      getById: async () => ({ id: "org-id", displayName: "Example Organization", status: "active" }),
    } },
    "../../../lib/permissions": require("../../../lib/permissions.ts"),
    "next/server": { NextResponse, after: (callback) => pending.push(callback) },
    "../../../lib/apiAuth": {
      authorize: async () => ({
        user: { id: "user-id", issuerId: "issuer-id", issuerName: "Logged-in issuer", organizationId: "org-id", roles },
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
      TemplateService: { getAvailableForIssuance: async (reference, scope) => {
        calls.push(["load-template", reference, scope]);
        return available ? {
          id: "template-row-id",
          issuerId: templateOwner,
          slug: "fta",
          issuerProfileId: profileMapped ? "profile-id" : null,
          isActive: true,
        } : null;
      } },
    },
    "../../../lib/document-store": {
      getDefaultDocumentStoreConfig: () => defaultStore,
      isRegistered: () => registrationEnabled,
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
      StatusListService: { reserveManaged: async (...args) => {
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

test("issue route uses managed organization signing while retaining the template profile document store", async () => {
  const { post, calls, profile, finish } = createRoute();
  const response = await post();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.signed, true);

  const payload = calls.find(([name]) => name === "payload")[1];
  assert.equal(payload.issuerDid, managedDid);
  assert.equal(payload.issuerDisplayName, profile.displayName);
  assert.equal(payload.issuerName, profile.displayName);
  assert.equal(payload.documentStoreAddress, profile.documentStoreAddress);

  const signing = calls.find(([name]) => name === "sign");
  assert.equal(signing[2], undefined);
  assert.deepEqual(signing[3], {
    did: managedDid,
    verificationMethod: managedMethod,
    publicKeyMultibase: "zPublic",
    secretKeyMultibase: "zSecret",
  });
  assert.equal(calls.some(([name]) => name === "legacy-key"), false);

  const stored = calls.find(([name]) => name === "persist")[1];
  assert.equal(stored.templateId, "template-row-id");
  assert.equal(stored.issuerProfileId, profile.id);
  assert.equal(stored.issuerDid, managedDid);
  assert.equal(stored.verificationMethod, managedMethod);
  assert.equal(stored.documentStoreAddress, profile.documentStoreAddress);
  assert.equal(stored.documentStoreNetwork, profile.documentStoreNetwork);
  assert.equal(stored.documentHash, `0x${"a".repeat(64)}`);
  assert.equal(calls.some(([name]) => name === "register-store"), false);
  await finish();
  const registration = calls.find(([name]) => name === "register-store");
  assert.equal(registration[3].address, profile.documentStoreAddress);
  assert.equal(registration[3].network, profile.documentStoreNetwork);
});

test("template owner controls issuance and sibling issuer access requires an assignment or platform permission", async () => {
  for (const roles of [["issuer-operator"], ["platform-admin"]]) {
    const { post, calls } = createRoute({ templateOwner: "other-issuer", roles });
    assert.equal((await post()).status, roles.includes("platform-admin") ? 200 : 500);
    assert.deepEqual(calls.find(([name]) => name === "load-template")[2], {
      organizationId: "org-id", platformAdmin: roles.includes("platform-admin"),
    });
    if (!roles.includes("platform-admin")) {
      assert.equal(calls.some(([name]) => name === "sign" || name === "persist"), false);
      continue;
    }
    assert.deepEqual(calls.find(([name]) => name === "load-profile").slice(1), ["profile-id","other-issuer"]);
    const payload = calls.find(([name]) => name === "payload")[1];
    assert.equal(payload.templateId, "fta");
    assert.equal(payload.issuerName, "Fintech Academy");
    assert.equal(payload.issuerDid, managedDid);
    const saved = calls.find(([name]) => name === "persist")[1];
    assert.equal(saved.issuerId, "other-issuer");
    assert.equal(saved.templateId, "template-row-id");
    assert.equal(saved.issuerProfileId, "profile-id");
  }
});

test("inaccessible IDs and legacy slugs cannot bypass saved-template authorization", async () => {
  for (const templateId of ["other-template-id", "classic"]) {
    const { post, calls } = createRoute({ available: false });
    assert.equal((await post({ templateId })).status, 404);
    assert.equal(calls.some(([name]) => name === "sign" || name === "persist"), false);
  }
});

test("managed Bitstring status is allocated against the template owner and organization DID", async () => {
  const { post, calls } = createRoute({ statusProfile: "bitstring" });
  const response = await post();
  assert.equal(response.status, 200);
  assert.ok(calls.some(([name]) => name === "reserve-status"));
  assert.deepEqual(calls.find(([name]) => name === "reserve-status").slice(1), [
    "issuer-id",
    "external-id",
    managedDid,
  ]);
  assert.ok(calls.some(([name]) => name === "sign"));
});

test("unmapped templates ignore client-supplied DID, display name, and Document Store", async () => {
  const { post, calls, defaultStore, finish } = createRoute({ profileMapped: false });
  const response = await post();
  assert.equal(response.status, 200);
  const payload = calls.find(([name]) => name === "payload")[1];
  assert.equal(payload.issuerDid, managedDid);
  assert.equal(payload.issuerDisplayName, "Fintech Academy");
  assert.equal(payload.documentStoreAddress, defaultStore.address);
  assert.equal(payload.documentStoreNetwork, defaultStore.network);
  assert.equal(calls.some(([name]) => name === "profile-key"), false);
  assert.equal(calls.find(([name]) => name === "issuer-owned-key")[1],"issuer-id");
  assert.equal(calls.find(([name]) => name === "sign")[3].verificationMethod,managedMethod);
  assert.equal(calls.some(([name])=>name==="legacy-key"),false);
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
  assert.equal(result.blockchainRegistration, "wallet");
  assert.deepEqual(calls.find(([name]) => name === "payload")[1].issuingMethods, ["did"]);
  assert.equal(result.credential.credentialStatus[0].type, "BitstringStatusListEntry");
  assert.equal(result.credential.credentialStatus[0].targetHash, undefined);
  const record = calls.find(([name]) => name === "persist")[1];
  assert.equal(record.documentHash, `0x${"b".repeat(64)}`);
  assert.deepEqual(record.issuingMethods, ["did", "ethereum"]);
  await finish();
  assert.equal(calls.some(([name]) => name === "register-store"), false);
  assert.equal(result.documentStore.address, record.documentStoreAddress);
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

test("selecting Ethereum returns the issuer store for MetaMask without scheduling server registration", async () => {
  const { post, calls, finish } = createRoute({ statusProfile: "trustvc", registrationEnabled: false });
  const response = await post({ data: {
    id: "external-id", recipientName: "Test", recipientEmail: "test@example.com",
    certificateType: "Completion", issuingMethods: ["did", "ethereum"],
  } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.signed, true);
  assert.equal(result.blockchainRegistration, "wallet");
  assert.ok(calls.some(([name]) => name === "persist"));
  await finish();
  assert.equal(result.documentStore.address, "0x0000000000000000000000000000000000000001");
  assert.equal(calls.some(([name]) => name === "register-store"), false);
});

test("wallet registration does not use a server signer even when server registration would fail", async () => {
  const { post, calls, finish } = createRoute({
    statusProfile: "trustvc", registrationEnabled: false, registrationError: true,
  });
  const response = await post({ data: {
    id: "external-id", recipientName: "Test", recipientEmail: "test@example.com",
    certificateType: "Completion", issuingMethods: ["did", "ethereum"],
  } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).signed, true);
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
