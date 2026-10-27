const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

const source = ts.createSourceFile("BatchIssuePanel.tsx",
  readFileSync(`${__dirname}/BatchIssuePanel.tsx`, "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function collect(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleIssueAll") {
    handler = node.initializer.getText(source);
  }
  ts.forEachChild(node, collect);
}
collect(source);
assert.ok(handler);
const javascript = ts.transpileModule(`const run = ${handler};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(overrides = {}) {
  const state = {};
  const requests = [];
  const credential = { issuer: "did:web:verifiable.sg", proof: { proofValue: "server-proof" } };
  const dependencies = {
    templatesLoading: false,
    templateError: null,
    selectedTemplate: { id: "saved-fta", slug: "fta" },
    walletRequired: false,
    connected: false,
    issuing: false,
    hasValidity: false,
    rows: [
      { rowIndex: 1, recipientName: "Alice", recipientEmail: "alice@example.com", certificateType: "Completion", errors: [] },
      { rowIndex: 2, recipientName: "Bob", recipientEmail: "bob@example.com", certificateType: "Completion", errors: [] },
    ],
    setParseError: (value) => { state.error = value; },
    setIssuing: (value) => { state.issuing = value; },
    onIssuingChange: () => {},
    onIssuedCertificatesChange: (value) => { state.certificates = value; },
    setRows: (value) => { state.rows = value; },
    getISODateString: () => "2026-10-25T00:00:00Z",
    generateCertificateId: () => "certificate-id",
    issuingMethods: ["did"],
    certificateFormat: "v1",
    buildVCPayload: () => ({}),
    withBasePath: (url) => `/base${url}`,
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ signed: true, credential }) };
    },
    ...overrides,
  };
  const run = new Function(...Object.keys(dependencies), `${javascript}\nreturn run;`)(...Object.values(dependencies));
  return { run, state, requests, credential };
}

test("batch issuance sends the saved template ID for authorization and its slug for rendering on every row", async () => {
  const { run, state, requests, credential } = setup();
  await run();
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, "/base/api/issue");
    assert.equal(request.body.templateId, "saved-fta");
    assert.equal(request.body.data.templateId, "fta");
  }
  assert.equal(state.error, null);
  assert.equal(state.issuing, false);
  assert.equal(state.rows.every((row) => row.status === "success"), true);
  assert.equal(state.certificates.length, 2);
  assert.strictEqual(state.certificates[0].certificate, credential);
});

test("batch issuance blocks unavailable templates and surfaces catalog errors", async () => {
  for (const overrides of [
    { templatesLoading: true },
    { selectedTemplate: undefined },
    { templateError: "Unable to load templates." },
  ]) {
    const { run, state, requests } = setup(overrides);
    await run();
    assert.ok(state.error);
    assert.equal(requests.length, 0);
    assert.equal(state.certificates, undefined);
  }
});
