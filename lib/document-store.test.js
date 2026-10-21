const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(mocks) {
  const filename = path.resolve(__dirname, "document-store.ts");
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

test("profile revocation uses the supplied store and a configured platform signer", async (t) => {
  const envNames = [
    "DOCUMENT_STORE_PRIVATE_KEY",
    "DOCUMENT_STORE_ADDRESS",
    "SEPOLIA_RPC_URL",
    "MAINNET_RPC_URL",
    "ENABLE_DOCUMENT_STORE_REGISTRATION",
  ];
  const previous = envNames.map((name) => process.env[name]);
  t.after(() => envNames.forEach((name, index) => {
    if (previous[index] === undefined) delete process.env[name];
    else process.env[name] = previous[index];
  }));

  process.env.DOCUMENT_STORE_PRIVATE_KEY = "platform-secret";
  delete process.env.DOCUMENT_STORE_ADDRESS;
  process.env.MAINNET_RPC_URL = "https://mainnet.example/rpc";
  const calls = [];
  let revoked = false;
  let issued = true;
  class JsonRpcProvider {
    constructor(url) { this.url = url; }
  }
  class Wallet {
    constructor(privateKey, provider) {
      this.privateKey = privateKey;
      this.provider = provider;
    }
  }
  class Contract {
    constructor(address, abi, runner) {
      this.address = address;
      this.abi = abi;
      this.runner = runner;
      calls.push({ address, abi, runner });
    }
    async isIssued(hash) { calls.push(["isIssued", hash]); return issued; }
    async isRevoked(hash) { calls.push(["isRevoked", hash]); return revoked; }
    async revoke(hash) {
      calls.push(["revoke", hash]);
      revoked = true;
      return { hash: "0xdocument-store-tx", wait: async () => ({ status: 1 }) };
    }
  }

  const store = load({
    ethers: {
      Contract,
      isAddress: (address) => /^0x[\da-f]{40}$/i.test(address),
      JsonRpcProvider,
      Wallet,
    },
    "./constants": {
      DOCUMENT_STORE_CONFIG: { address: "0x92600b6B5fE4D15D87d7d264C6cAdCcaf9D74594" },
      NETWORKS: {
        sepolia: { rpcUrl: "https://sepolia.example/rpc" },
        mainnet: { rpcUrl: "https://ethereum.example/rpc" },
      },
    },
  });
  const address = "0x1111111111111111111111111111111111111111";
  const hash = `0x${"a".repeat(64)}`;
  assert.equal(store.getDefaultDocumentStoreConfig().address, "0x92600b6B5fE4D15D87d7d264C6cAdCcaf9D74594");
  assert.equal(require("ethers").isAddress(store.getDefaultDocumentStoreConfig().address), true);

  const result = await store.revokeHash(hash, { address, network: "mainnet" });
  assert.deepEqual(result, { txHash: "0xdocument-store-tx", alreadyRevoked: false });
  assert.equal(calls[0].address, address);
  assert.equal(calls[0].runner.provider.url, "https://mainnet.example/rpc");
  assert.deepEqual(calls.slice(1), [
    ["isIssued", hash],
    ["isRevoked", hash],
    ["revoke", hash],
  ]);
  assert.equal(calls[0].abi.some((entry) => entry.name === "revoke"), true);

  const repeated = await store.revokeHash(hash, { address, network: "mainnet" });
  assert.deepEqual(repeated, { alreadyRevoked: true });
  assert.equal(calls.filter((call) => Array.isArray(call) && call[0] === "revoke").length, 1);

  issued = false;
  revoked = false;
  await assert.rejects(store.revokeHash(hash, {
    address: "0x2222222222222222222222222222222222222222",
    network: "sepolia",
  }), /not registered/);
});

test("Document Store writes fail explicitly when the platform transaction key is missing", async (t) => {
  const names = ["DOCUMENT_STORE_PRIVATE_KEY", "SEPOLIA_DEPLOYER_PRIVATE_KEY"];
  const previous = names.map((name) => process.env[name]);
  t.after(() => {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  });
  delete process.env.DOCUMENT_STORE_PRIVATE_KEY;
  delete process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;

  const store = load({
    ethers: {
      Contract: class {},
      isAddress: () => true,
      JsonRpcProvider: class {},
      Wallet: class {},
    },
    "./constants": {
      DOCUMENT_STORE_CONFIG: { address: "0x92600b6B5fE4D15D87d7d264C6cAdCcaf9D74594" },
      NETWORKS: { sepolia: { rpcUrl: "https://sepolia.example/rpc" } },
    },
  });

  await assert.rejects(store.revokeHash(`0x${"a".repeat(64)}`, {
    address: "0x1111111111111111111111111111111111111111",
    network: "sepolia",
  }), /DOCUMENT_STORE_PRIVATE_KEY is required/);
});

test("registration uses the configured store, checks issuance, and confirms a successful receipt", async (t) => {
  const names = ["DOCUMENT_STORE_PRIVATE_KEY", "SEPOLIA_DEPLOYER_PRIVATE_KEY",
    "DOCUMENT_STORE_ADDRESS", "ENABLE_DOCUMENT_STORE_REGISTRATION"];
  const previous = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, index) => {
    if (previous[index] === undefined) delete process.env[name];
    else process.env[name] = previous[index];
  }));
  delete process.env.DOCUMENT_STORE_PRIVATE_KEY;
  process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY = "test-secret-never-log";
  process.env.DOCUMENT_STORE_ADDRESS = "0x814D9c222D3b5A8282e0467Fa12b24C057731dD6";
  process.env.ENABLE_DOCUMENT_STORE_REGISTRATION = "true";
  let issued = false;
  let readFailure = false;
  let receiptStatus = 1;
  let timeout = false;
  const calls = [];
  const store = load({
    ethers: {
      isAddress: () => true,
      JsonRpcProvider: class {},
      Wallet: class { constructor(key) { assert.equal(key, "test-secret-never-log"); } },
      Contract: class {
        constructor(address) { calls.push(["contract", address]); }
        async isIssued(hash) {
          calls.push(["isIssued", hash]);
          if (readFailure) throw new Error("sensitive-rpc-url");
          return issued;
        }
        async issue(hash) {
          calls.push(["issue", hash]);
          return { hash: "0xtx", wait: async (confirmations, milliseconds) => {
            assert.equal(confirmations, 1);
            assert.equal(milliseconds, 60_000);
            if (timeout) throw new Error("sensitive-rpc-url");
            return { status: receiptStatus, blockNumber: 123 };
          } };
        }
      },
    },
    "./constants": {
      DOCUMENT_STORE_CONFIG: { address: "0x92600b6B5fE4D15D87d7d264C6cAdCcaf9D74594" },
      NETWORKS: { sepolia: { rpcUrl: "https://example.com", chainId: 11155111 },
      mainnet: { rpcUrl: "https://example.com", chainId: 1 } } },
  });
  const hash = `0x${"a".repeat(64)}`;
  assert.equal(store.getDefaultDocumentStoreConfig().address, process.env.DOCUMENT_STORE_ADDRESS);
  const submissions = [];
  assert.deepEqual(await store.registerHash(hash, undefined, undefined, async (txHash) => {
    submissions.push(txHash);
  }), { txHash: "0xtx", hashExists: true, registered: true });
  assert.deepEqual(submissions, ["0xtx"]);
  assert.equal(calls[0][1], process.env.DOCUMENT_STORE_ADDRESS);
  assert.deepEqual(calls.filter(([name]) => name === "isIssued" || name === "issue"),
    [["isIssued", hash], ["issue", hash]]);

  issued = true;
  assert.deepEqual(await store.registerHash(hash), { hashExists: true, registered: false });
  assert.equal(calls.filter(([name]) => name === "issue").length, 1);
  issued = false;
  readFailure = true;
  const failedRead = await store.registerHash(hash);
  assert.equal(failedRead.registered, false);
  assert.ok(failedRead.error);
  assert.equal(failedRead.error.includes("sensitive-rpc-url"), false);
  assert.equal(calls.filter(([name]) => name === "issue").length, 1);
  readFailure = false;
  receiptStatus = 0;
  assert.equal((await store.registerHash(hash)).registered, false);
  timeout = true;
  const pending = await store.registerHash(hash);
  assert.equal(pending.txHash, "0xtx");
  assert.equal(pending.registered, false);
  assert.ok(pending.error);

  await assert.rejects(store.revokeHash(hash, {
    address: process.env.DOCUMENT_STORE_ADDRESS, network: "mainnet",
  }), /DOCUMENT_STORE_PRIVATE_KEY is required/);
  const invalid = await store.registerHash("invalid");
  assert.ok(invalid.error);
});

test("explicit Ethereum registration bypasses the automatic flag but still reports signer failures", async (t) => {
  const names = ["ENABLE_DOCUMENT_STORE_REGISTRATION", "NEXT_PUBLIC_ENABLE_DOCUMENT_STORE_REGISTRATION",
    "DOCUMENT_STORE_PRIVATE_KEY", "SEPOLIA_DEPLOYER_PRIVATE_KEY"];
  const previous = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, index) => {
    if (previous[index] === undefined) delete process.env[name];
    else process.env[name] = previous[index];
  }));
  names.forEach((name) => delete process.env[name]);
  let submissions = 0;
  const store = load({
    ethers: {
      isAddress: () => true,
      JsonRpcProvider: class {},
      Wallet: class {},
      Contract: class {
        async isIssued() { return false; }
        async issue() {
          submissions++;
          return { hash: "0xrequired", wait: async () => ({ status: 1 }) };
        }
      },
    },
    "./constants": {
      DOCUMENT_STORE_CONFIG: { address: "0x814D9c222D3b5A8282e0467Fa12b24C057731dD6" },
      NETWORKS: { sepolia: { rpcUrl: "https://example.invalid", chainId: 11155111 } },
    },
  });

  const hash = `0x${"b".repeat(64)}`;
  assert.deepEqual(await store.registerHash(hash), { hashExists: false, registered: false });
  const failed = await store.registerHash(hash, undefined, undefined, undefined, { required: true });
  assert.ok(failed.error);
  assert.equal(submissions, 0);
  process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY = "synthetic-test-key";
  const submitted = [];
  const result = await store.registerHash(hash, undefined, undefined, async (txHash) => {
    submitted.push(txHash);
  }, { required: true });
  assert.equal(result.registered, true);
  assert.equal(submissions, 1);
  assert.deepEqual(submitted, ["0xrequired"]);
});

test("separate anchor reads validate the chain and never call isRevoked on an unissued hash", async () => {
    let issued = false;
    let revoked = false;
    let chainId = 11155111n;
    let destroys = 0;
    let revocationReads = 0;
    const store = load({
      ethers: {
        isAddress: () => true,
        JsonRpcProvider: class {
          async getNetwork() { return { chainId }; }
          destroy() { destroys++; }
        },
        Wallet: class {},
        Contract: class {
          async isIssued() { return issued; }
          async isRevoked() { revocationReads++; return revoked; }
        },
      },
      "./constants": {
        DOCUMENT_STORE_CONFIG: { address: "0x1111111111111111111111111111111111111111" },
        NETWORKS: { sepolia: { rpcUrl: "https://example.invalid", chainId: 11155111 } },
      },
    });
    const hash = `0x${"a".repeat(64)}`;
    const config = store.getDefaultDocumentStoreConfig();
    assert.deepEqual(await store.checkHashRegistration(hash, config), { issued: false, revoked: false });
    assert.equal(revocationReads, 0);
    issued = true;
    assert.deepEqual(await store.checkHashRegistration(hash, config), { issued: true, revoked: false });
    revoked = true;
    assert.deepEqual(await store.checkHashRegistration(hash, config), { issued: true, revoked: true });
    chainId = 1n;
    await assert.rejects(store.checkHashRegistration(hash, config), /network mismatch/);
    assert.equal(destroys, 4);
    await assert.rejects(store.checkHashRegistration("invalid", config), /Invalid/);
  });
