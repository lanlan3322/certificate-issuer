const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

// Execute the actual event handler with isolated UI, HTTP and wallet boundaries.
const source = ts.createSourceFile(
  "page.tsx",
  readFileSync(`${__dirname}/page.tsx`, "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const declarations = new Map();
function collect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    declarations.set(node.name.text, node);
  }
  ts.forEachChild(node, collect);
}
collect(source);

function expression(name) {
  const declaration = declarations.get(name);
  assert.ok(declaration?.initializer, `${name} must exist in the issuance page`);
  return declaration.initializer.getText(source);
}

function compile(expression, dependencies) {
  const javascript = ts.transpileModule(`const run = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${javascript}\nreturn run;`)(
    ...Object.values(dependencies)
  );
}

const credential = {
  issuer: "did:web:verifiable.sg",
  credentialSubject: { name: "Test Recipient" },
  proof: {
    type: "DataIntegrityProof",
    cryptosuite: "ecdsa-sd-2023",
    verificationMethod: "did:web:verifiable.sg#test-key",
    proofValue: "test-server-proof",
  },
};

function setup({
  methods = ["did"],
  connected = false,
  status = 200,
  body = { signed: true, credential },
} = {}) {
  const state = {};
  const calls = { requests: [], walletSignatures: 0, signers: 0, anchors: 0 };
  const setters = Object.fromEntries(
    ["Errors", "Issuing", "IssuedCert", "IssuedTxHash", "DIDResult", "EthereumResult"].map(
      (name) => [`set${name}`, (value) => { state[name] = value; }]
    )
  );
  const run = compile(expression("handleIssue"), {
    ...setters,
    formData: {
      recipientName: "Test Recipient",
      recipientEmail: "test@example.com",
      certificateType: "ProfessionalCertificate",
      templateId: "classic",
      description: "Proof preservation regression",
      hasValidity: false,
      certificateFormat: "w3c",
    },
    issuingMethods: methods,
    connected,
    network: "sepolia",
    validateCertificateData: () => ({ valid: true }),
    validateIssuingMethods: () => ({ valid: true }),
    getISODateString: () => "2026-10-14T00:00:00Z",
    generateCertificateId: () => "test-credential-id",
    dateInputToISO: () => { throw new Error("No validity dates expected"); },
    fetch: async (url, options) => {
      calls.requests.push({ url, body: JSON.parse(options.body) });
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    },
    getSigner: async () => { calls.signers++; return { wallet: true }; },
    switchToSepolia: async () => { throw new Error("Already on Sepolia"); },
    buildVCPayload: () => ({ unsigned: true }),
    signCredentialWithEthereum: async (payload) => {
      calls.walletSignatures++;
      return {
        credential: { ...payload, proof: { type: "EthereumPersonalSignature2024" } },
        walletAddress: "test-wallet",
        signature: "test-wallet-signature",
      };
    },
    issueCertificateToEthereum: async () => {
      calls.anchors++;
      return { txHash: "test-transaction" };
    },
    DOCUMENT_STORE_CONFIG: { address: "test-store" },
  });
  return { run, state, calls };
}

test("DID-only issuance preserves server proof without connecting or invoking a wallet", async () => {
  const { run, state, calls } = setup();
  const original = structuredClone(credential);
  await run();
  assert.deepEqual(state.Errors, []);
  assert.equal(state.Issuing, false);
  assert.ok(state.IssuedCert);
  assert.equal(state.DIDResult.signed, true);
  assert.strictEqual(state.DIDResult.credential, credential);
  assert.deepEqual(credential, original);
  assert.equal(calls.signers, 0);
  assert.equal(calls.walletSignatures, 0);
  assert.equal(calls.requests[0].url, "/api/issue");
  assert.equal(calls.requests[0].body.certificateFormat, "w3c");

  const current = compile(expression("currentCredential"), {
    useMemo: (callback) => callback(),
    didResult: state.DIDResult,
    ethereumResult: null,
    issuedCert: state.IssuedCert,
    buildVCPayload: () => { throw new Error("Must not rebuild a signed credential"); },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(current)).proof, original.proof);
});

test("combined issuance preserves DID download while retaining separate Ethereum signing and anchoring", async () => {
  const { run, state, calls } = setup({ methods: ["did", "ethereum"], connected: true });
  await run();
  assert.strictEqual(state.DIDResult.credential, credential);
  assert.equal(state.EthereumResult.credential.proof.type, "EthereumPersonalSignature2024");
  assert.equal(calls.walletSignatures, 1);
  assert.equal(calls.anchors, 1);
  assert.equal(state.IssuedTxHash, "test-transaction");
  const current = compile(expression("currentCredential"), {
    useMemo: (callback) => callback(),
    didResult: state.DIDResult,
    ethereumResult: state.EthereumResult,
    issuedCert: state.IssuedCert,
    buildVCPayload: () => { throw new Error("Must preserve server output"); },
  });
  assert.strictEqual(current, credential);
});

test("Ethereum-only issuance still uses its wallet proof", async () => {
  const { run, state, calls } = setup({ methods: ["ethereum"], connected: true });
  await run();
  assert.equal(calls.requests.length, 0);
  assert.equal(calls.walletSignatures, 1);
  assert.equal(calls.anchors, 1);
  assert.equal(state.EthereumResult.credential.proof.type, "EthereumPersonalSignature2024");
});

test("Ethereum issuance still requires a connected wallet", async () => {
  const { run, state, calls } = setup({ methods: ["did", "ethereum"] });
  await run();
  assert.match(state.Errors[0], /connect MetaMask/);
  assert.equal(calls.requests.length, 0);
});

test("unsigned, incomplete and failed DID responses cannot fall back to wallet signing", async (t) => {
  for (const [name, options] of [
    ["unsigned", { body: { signed: false, credential } }],
    ["missing credential", { body: { signed: true } }],
    ["missing proof", { body: { signed: true, credential: { issuer: credential.issuer } } }],
    ["unauthorized", { status: 401, body: { error: "Unauthorized" } }],
    ["unconfigured", { status: 503, body: { error: "DID signing is not configured." } }],
  ]) {
    await t.test(name, async () => {
      const { run, state, calls } = setup(options);
      await run();
      assert.equal(state.Errors.length, 1);
      assert.equal(state.IssuedCert, null);
      assert.equal(state.DIDResult, null);
      assert.equal(state.Issuing, false);
      assert.equal(calls.walletSignatures, 0);
    });
  }
});
