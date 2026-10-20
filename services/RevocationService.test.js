const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(mocks) {
  const filename = path.resolve(__dirname, "RevocationService.ts");
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

function createHarness(credential) {
  const operations = [];
  let insertedPayload;
  const query = {
    select(selection) { operations.push(["select", selection]); return this; },
    eq(column, value) { operations.push(["eq", column, value]); return this; },
    maybeSingle: async () => ({ data: credential, error: null }),
    insert(value) { insertedPayload = value; operations.push(["insert", value]); return this; },
    single: async () => ({ data: {
      id: "revocation-id", credential_id: credential.id, issuer_id: "issuer",
      action: "revoke", reason: "policy", transaction_hash: insertedPayload?.transaction_hash,
      created_at: "2026-10-20T00:00:00.000Z",
    }, error: null }),
    update(value) { operations.push(["update", value]); return this; },
    then(resolve, reject) {
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
  const supabase = { from: (table) => { operations.push(["from", table]); return query; } };
  const revocations = {
    from: (table) => { operations.push(["from", table]); return query; },
    rpc: async (name, args) => {
      operations.push(["rpc", name, args]);
      return {
        data: {
          id: "revocation-id",
          credential_id: credential.id,
          issuer_id: args.p_issuer,
          action: args.p_action,
          reason: args.p_reason,
          transaction_hash: args.p_transaction,
          created_at: "2026-10-20T00:00:00.000Z",
          external_id: credential.external_id,
          credential_status: args.p_action === "revoke" ? "revoked" : "suspended",
        },
        error: null,
      };
    },
  };
  let chainResult = { txHash: "0xchain-tx", alreadyRevoked: false };
  const chainCalls = [];
  const loaded = load({
    "../lib/supabase/server": {
      getSupabaseServerClient: async () => supabase,
      getSupabaseAdmin: () => revocations,
    },
    "../lib/document-store": {
      revokeHash: async (...args) => {
        chainCalls.push(args);
        if (chainResult instanceof Error) throw chainResult;
        return chainResult;
      },
    },
  });
  return {
    service: loaded.RevocationService,
    operations,
    chainCalls,
    setChainResult(value) { chainResult = value; },
  };
}

test("profile credential revocation uses its saved Document Store and records the transaction", async () => {
  const harness = createHarness({
    id: "credential-id",
    status: "issued",
    external_id: "certificate-123",
    issuer_profile_id: "profile-id",
    document_store_address: "0x1111111111111111111111111111111111111111",
    document_store_network: "mainnet",
    credential: JSON.stringify({
      credentialStatus: [{ targetHash: `0x${"a".repeat(64)}` }],
    }),
  });

  const result = await harness.service.apply({
    credentialRef: "certificate-123",
    issuerId: "issuer",
    action: "revoke",
    reason: "policy",
    transactionHash: "0xclient-supplied",
  });

  assert.equal(harness.chainCalls.length, 1);
  assert.deepEqual(harness.chainCalls[0], [
    `0x${"a".repeat(64)}`,
    { address: "0x1111111111111111111111111111111111111111", network: "mainnet" },
  ]);
  const inserted = harness.operations.find(([name]) => name === "insert")[1];
  assert.equal(inserted.transaction_hash, "0xchain-tx");
  assert.equal(result.credentialStatus, "revoked");
});

test("profile revocation stops before changing database state if Document Store revocation fails", async (t) => {
  t.mock.method(console, "error", () => {});
  const harness = createHarness({
    id: "credential-id",
    status: "issued",
    external_id: "certificate-123",
    issuer_profile_id: "profile-id",
    document_store_address: "0x1111111111111111111111111111111111111111",
    document_store_network: "mainnet",
    credential: { credentialStatus: [{ targetHash: `0x${"a".repeat(64)}` }] },
  });
  harness.setChainResult(new Error("store rejected transaction"));

  await assert.rejects(
    harness.service.apply({
      credentialRef: "certificate-123", issuerId: "issuer", action: "revoke", reason: "policy",
    }),
    /store rejected transaction/
  );
  assert.equal(harness.operations.some(([name]) => name === "insert" || name === "update"), false);
});

test("legacy credentials keep database-only revocation behavior", async () => {
  const harness = createHarness({
    id: "credential-id",
    status: "issued",
    external_id: "certificate-123",
    issuer_profile_id: null,
    document_store_address: null,
    document_store_network: null,
    credential: {},
  });

  const result = await harness.service.apply({
    credentialRef: "certificate-123",
    issuerId: "issuer",
    action: "revoke",
    reason: "policy",
    transactionHash: "0xlegacy-tx",
  });

  assert.equal(harness.chainCalls.length, 0);
  assert.equal(harness.operations.find(([name]) => name === "insert")[1].transaction_hash, "0xlegacy-tx");
  assert.equal(result.credentialStatus, "revoked");
});

test("profile Bitstring revocation revokes the saved Document Store before the atomic status update", async () => {
  const harness = createHarness({
    id: "credential-id",
    status: "issued",
    external_id: "certificate-123",
    issuer_profile_id: "profile-id",
    document_store_address: "0x1111111111111111111111111111111111111111",
    document_store_network: "mainnet",
    credential: JSON.stringify({
      credentialStatus: [{ type: "BitstringStatusListEntry", statusPurpose: "revocation" }],
      signature: { targetHash: `0x${"b".repeat(64)}` },
    }),
  });

  const result = await harness.service.apply({
    credentialRef: "certificate-123",
    issuerId: "issuer",
    action: "revoke",
    reason: "policy",
  });

  assert.equal(harness.chainCalls.length, 1);
  assert.deepEqual(harness.chainCalls[0], [
    `0x${"b".repeat(64)}`,
    { address: "0x1111111111111111111111111111111111111111", network: "mainnet" },
  ]);
  const atomicCall = harness.operations.find(([name]) => name === "rpc");
  assert.equal(atomicCall[1], "apply_bitstring_revocation");
  assert.equal(atomicCall[2].p_transaction, "0xchain-tx");
  assert.equal(result.transactionHash, "0xchain-tx");
  assert.equal(result.credentialStatus, "revoked");
});

test("TrustVC status-list revocation does not depend on optional blockchain registration", async () => {
  const harness = createHarness({
    id: "credential-id", status: "issued", external_id: "certificate-123",
    issuer_profile_id: "profile-id",
    document_store_address: "0x1111111111111111111111111111111111111111",
    document_store_network: "sepolia",
    credential: JSON.stringify({ issuingMethods: ["did"],
      credentialStatus: [{ type: "BitstringStatusListEntry", statusPurpose: "revocation" }] }),
  });
  const result = await harness.service.apply({
    credentialRef: "certificate-123", issuerId: "issuer", action: "revoke", reason: "test",
  });
  assert.equal(harness.chainCalls.length, 0);
  assert.equal(harness.operations.find(([name]) => name === "rpc")[1], "apply_bitstring_revocation");
  assert.equal(result.credentialStatus, "revoked");
});
