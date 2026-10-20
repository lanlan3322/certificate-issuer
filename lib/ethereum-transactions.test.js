const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { pathToFileURL } = require("node:url");
const ts = require("typescript");
const ethers = require("ethers");

test("the browser default selects the deployed Verifiable.sg Sepolia store", () => {
  const filename = path.resolve(__dirname, "constants.ts");
  const instance = new Module(filename, module);
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  assert.equal(instance.exports.DOCUMENT_STORE_CONFIG.address,
    "0x814D9c222D3b5A8282e0467Fa12b24C057731dD6");
  assert.equal(ethers.isAddress(instance.exports.DOCUMENT_STORE_CONFIG.address), true);
});

function load({ precheckError, receipt = { hash: "0xconfirmed", status: 1 }, revoked = false,
  realContract = false, issued = false } = {}) {
  const calls = [];
  const signer = realContract ? {
    call: async (tx) => {
      if (tx.data.startsWith(ethers.id("isIssued(bytes32)").slice(0, 10))) {
        return ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false]);
      }
      calls.push(["simulation"]); return "0x";
    },
    sendTransaction: async () => { calls.push(["wallet-request"]); throw new Error("ACTION_REJECTED"); },
  } : {};
  const address = "0x814D9c222D3b5A8282e0467Fa12b24C057731dD6";
  class Contract {
    constructor(store, abi, runner) {
      assert.equal(store, address);
      assert.equal(runner, signer);
      if (realContract) return new ethers.Contract(store, abi, runner);
      for (const method of ["issue", "revoke"]) {
        this[method] = async (hash) => {
          calls.push([method, hash]);
          return { wait: async () => receipt };
        };
        this[method].staticCall = async (hash) => {
          calls.push([`${method}.staticCall`, hash]);
          if (precheckError) throw new Error(precheckError);
        };
      }
    }
    async isRevoked() { return revoked; }
    async isIssued() { return issued; }
  }
  const filename = path.resolve(__dirname, "trustvc.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => {
    if (name === "ethers") return { ...ethers, Contract };
    if (name === "./constants") return { TRUSTVC_CONFIG: { didUrl: "did:web:example.com" } };
    if (name === "./did-utils") return { resolvePublicKeyMultibase: () => undefined };
    return normalRequire(name);
  };
  const source = readFileSync(filename, "utf8")
    .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
  instance._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true },
  }).outputText, filename);
  return { api: instance.exports, calls, signer, address };
}

for (const [method, action] of [
  ["issueCertificateToEthereum", "issue"],
  ["revokeCertificateOnEthereum", "revoke"],
]) {
  test(`${action} uses ethers v6 staticCall and returns the confirmed receipt hash`, async () => {
    const { api, calls, signer, address } = load();
    const result = await api[method]({ id: "synthetic-test" }, address, signer);
    assert.equal(result.error, undefined);
    assert.equal(result.txHash, "0xconfirmed");
    assert.match(result.documentHash, /^0x[\da-f]{64}$/);
    assert.deepEqual(calls, [
      [`${action}.staticCall`, result.documentHash],
      [action, result.documentHash],
    ]);
  });

  test(`${action} does not broadcast when its pre-check fails`, async () => {
    const { api, calls, signer, address } = load({ precheckError: "AccessControl: missing role" });
    const result = await api[method]({ id: "test" }, address, signer);
    assert.match(result.error, /Pre-check failed/);
    assert.equal(result.txHash, undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], `${action}.staticCall`);
  });

  test(`${action} does not report an absent or reverted receipt as success`, async () => {
    for (const receipt of [null, { hash: "0xreverted", status: 0 }]) {
      const { api, signer, address } = load({ receipt });
      const result = await api[method]({ id: "test" }, address, signer);
      assert.match(result.error, /not confirmed successfully/);
      assert.equal(result.txHash, undefined);
    }
  });
}

test("already-issued errors and already-revoked documents retain their explicit feedback", async () => {
  const issued = load({ precheckError: "DocumentIssuedPreviously" });
  const result = await issued.api.issueCertificateToEthereum({}, issued.address, issued.signer);
  assert.equal(result.error, "This document has already been issued.");
  const revoked = load({ revoked: true });
  const revokedResult = await revoked.api.revokeCertificateOnEthereum({}, revoked.address, revoked.signer);
  assert.equal(revokedResult.error, "This document is already revoked.");
  assert.deepEqual(revoked.calls, []);
});

test("the installed ethers Contract completes simulation and reaches the wallet request", async () => {
  const { api, signer, address, calls } = load({ realContract: true });
  const result = await api.issueCertificateToEthereum({ id: "test" }, address, signer);
  assert.equal(result.error, "Transaction rejected by user.");
  assert.deepEqual(calls, [["simulation"], ["wallet-request"]]);
});

test("wallet issuance skips an active hash already registered by the platform but rejects a revoked hash", async () => {
  for (const revoked of [false, true]) {
    const { api, signer, address, calls } = load({ issued: true, revoked });
    const credential = { id: "same-download" };
    const result = await api.issueCertificateToEthereum(credential, address, signer);
    assert.equal(Boolean(result.error), revoked);
    if (!revoked) assert.strictEqual(result.credential, credential);
    if (!revoked) assert.equal(result.alreadyRegistered, true);
    assert.deepEqual(calls, []);
  }
});
