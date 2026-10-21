const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");

function harness({ issued = true, revoked = false, unavailable = false, mismatch = false,
  methods = ["did", "ethereum"], valid = true, missingStore = false } = {}) {
  const hash = `0x${"a".repeat(64)}`;
  const calls = [];
  const record = {
    id: "row-id", status: "issued", issuingMethods: methods, documentHash: mismatch ? `0x${"b".repeat(64)}` : hash,
    documentStoreAddress: missingStore ? null : "0x1111111111111111111111111111111111111111",
    documentStoreNetwork: "sepolia", credential: { id: "certificate-id" },
  };
  const mocks = {
    "next/server": { NextResponse },
    "../../../lib/trustvc": {
      computeDocumentStoreHash: () => hash,
      createTrustVCDocumentLoader: async () => ({}),
      getTrustVCContextUrls: async () => new Set(),
      verifyCredential: async () => ({ valid, details: {
        credentialStatus: "verified", blockchainVerification: "not required",
      } }),
    },
    "../../../lib/document-store": { checkHashRegistration: async (...args) => {
      calls.push(args);
      if (unavailable) throw new Error("private-rpc-url");
      return { issued, revoked };
    } },
    "../../../services/CredentialService": {
      CredentialService: { findForPublicVerification: async () => record },
    },
    "../../../services/VerificationService": { VerificationService: { log: async () => {} } },
    "../../../lib/safe-document-loader": { createSafeDocumentLoader: () => ({}) },
    "../../../lib/apiAuth": { clientIp: () => "127.0.0.1" },
    "../../../lib/auth": { enforceRateLimit: async () => {}, RateLimitError: class extends Error {} },
  };
  const filename = path.join(__dirname, "route.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(__dirname);
  instance.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { calls, hash, post: async (byId = false) => {
    const response = await instance.exports.POST(new Request("https://verifiable.sg/api/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(byId ? { externalId: "certificate-id" } : { credential: record.credential }),
    }));
    assert.equal(response.status, 200);
    return response.json();
  } };
}

test("uploaded and ID-based status-list credentials check the exact saved hash and issuer store", async () => {
  for (const byId of [false, true]) {
    const { post, calls, hash } = harness();
    const result = await post(byId);
    assert.equal(result.details.blockchainVerification, "passed");
    assert.equal(result.valid, true);
    assert.deepEqual(calls, [[hash, {
      address: "0x1111111111111111111111111111111111111111", network: "sepolia",
    }]]);
  }
});

test("missing or revoked anchors are never reported as blockchain verified", async () => {
  for (const state of [{ issued: false }, { revoked: true }]) {
    const result = await harness(state).post();
    assert.equal(result.details.blockchainVerification, "failed");
    assert.equal(result.details.credentialStatus, "verified");
  }
});

test("RPC failure, mismatched files and missing snapshots report unavailable without false positives", async () => {
  for (const state of [{ unavailable: true }, { mismatch: true }, { missingStore: true }]) {
    const { post, calls } = harness(state);
    const result = await post();
    assert.equal(result.details.blockchainVerification, "unavailable");
    assert.equal(JSON.stringify(result).includes("private-rpc-url"), false);
    if (!state.unavailable) assert.equal(calls.length, 0);
  }
});

test("DID-only and invalid documents never use separate chain metadata", async () => {
  for (const state of [{ methods: ["did"] }, { valid: false }]) {
    const { post, calls } = harness(state);
    await post();
    assert.equal(calls.length, 0);
  }
});
