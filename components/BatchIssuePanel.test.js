const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

const source = ts.createSourceFile("BatchIssuePanel.tsx",
  readFileSync(`${__dirname}/BatchIssuePanel.tsx`, "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
let dateConverter;
function collect(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleIssueAll") {
    handler = node.initializer.getText(source);
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text === "dateInputToISO") {
    dateConverter = node.getText(source);
  }
  ts.forEachChild(node, collect);
}
collect(source);
assert.ok(handler);
const javascript = ts.transpileModule(`const run = ${handler};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const dateInputToISO = new Function(`${ts.transpileModule(dateConverter, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText}\nreturn dateInputToISO;`)();

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
    rows: [
      { rowIndex: 1, recipientName: "Alice", recipientEmail: "alice@example.com", certificateType: "Completion", errors: [] },
      { rowIndex: 2, recipientName: "Bob", recipientEmail: "bob@example.com", certificateType: "Completion", errors: [] },
    ],
    setParseError: (value) => { state.error = value; },
    setIssuing: (value) => { state.issuing = value; },
    onIssuingChange: () => {},
    onIssuedCertificatesChange: (value) => { state.certificates = value; },
    setRows: (value) => { state.rows = value; },
    getTodayDateInputValue: () => "2026-10-25",
    dateInputToISO,
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
    assert.equal(request.body.data.issueDate, "2026-10-25T00:00:00.000Z");
    assert.equal(request.body.data.signedDate, "2026-10-25T00:00:00.000Z");
    assert.equal(request.body.data.validFrom, "2026-10-25T00:00:00.000Z");
    assert.equal(request.body.data.validUntil, undefined);
  }
  assert.equal(state.error, null);
  assert.equal(state.issuing, false);
  assert.equal(state.rows.every((row) => row.status === "success"), true);
  assert.equal(state.certificates.length, 2);
  assert.strictEqual(state.certificates[0].certificate, credential);
});

test("batch issuance rejects an invalid supplied issue date before processing certificates", async () => {
  const { run, state, requests } = setup({
    rows: [{ recipientName: "Alice", errors: [], issueDate: "not-a-date" }],
  });
  await run();
  assert.equal(state.error, "Issuing date is required and must be valid.");
  assert.equal(requests.length, 0);
  assert.equal(state.certificates, undefined);
});

test("batch issuance rejects an invalid supplied signed date before processing certificates", async () => {
  const { run, state, requests } = setup({
    rows: [{ recipientName: "Alice", errors: [], signedDate: "not-a-date" }],
  });
  await run();
  assert.equal(state.error, "Signed date is required and must be valid.");
  assert.equal(requests.length, 0);
  assert.equal(state.certificates, undefined);
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

test("batch issuance applies per-recipient parameters and uses the system date with no expiry for blank cells", async () => {
  const { run, state, requests } = setup({
    rows: [
      { rowIndex: 1, recipientName: "Alice", recipientEmail: "alice@example.com", errors: [],
        certificateNo: "FTA-001", courseLength: 40, issueDate: "2026-11-12", signedDate: "2026-11-13",
        hasValidity: true, validFrom: "2026-11-14", validUntil: "2027-11-14" },
      { rowIndex: 2, recipientName: "Bob", recipientEmail: "bob@example.com", errors: [], hasValidity: false },
      { rowIndex: 3, recipientName: "Carol", recipientEmail: "carol@example.com", errors: [] },
    ],
  });
  await run();
  assert.equal(requests.length, 3);
  const [custom, lifetime, defaults] = requests.map((request) => request.body.data);
  assert.equal(custom.certificateNo, "FTA-001");
  assert.equal(custom.courseLength, 40);
  assert.equal(custom.issueDate, "2026-11-12T00:00:00.000Z");
  assert.equal(custom.signedDate, "2026-11-13T00:00:00.000Z");
  assert.equal(custom.validFrom, "2026-11-14T00:00:00.000Z");
  assert.equal(custom.validUntil, "2027-11-14T23:59:59.999Z");
  assert.equal(lifetime.validUntil, undefined);
  assert.equal(defaults.issueDate, "2026-10-25T00:00:00.000Z");
  assert.equal(defaults.signedDate, "2026-10-25T00:00:00.000Z");
  assert.equal(defaults.validFrom, "2026-10-25T00:00:00.000Z");
  assert.equal(defaults.validUntil, undefined);
  assert.ok(state.rows.every((row) => row.status === "success"));
});

test("batch issuance validates expiry against the system date when validFrom is blank", async () => {
  const { run, state, requests } = setup({
    rows: [{ recipientName: "Alice", errors: [], validUntil: "2026-10-24" }],
  });
  await run();
  assert.equal(state.error, "Valid until date must be on or after valid from date.");
  assert.equal(requests.length, 0);
});

test("expiry is inferred from validUntil, but explicit false disables it and true alone does not invent an expiry", async () => {
  const { run, state, requests } = setup({
    rows: [
      { recipientName: "Alice", errors: [], validUntil: "2027-10-25" },
      { recipientName: "Bob", errors: [], hasValidity: false, validUntil: "2026-10-24", validFrom: "2026-10-20" },
      { recipientName: "Carol", errors: [], hasValidity: true },
    ],
  });
  await run();
  assert.equal(requests.length, 3);
  assert.equal(requests[0].body.data.validUntil, "2027-10-25T23:59:59.999Z");
  assert.equal(requests[0].body.data.validFrom, "2026-10-25T00:00:00.000Z");
  assert.equal(requests[1].body.data.validUntil, undefined);
  assert.equal(requests[1].body.data.validFrom, "2026-10-20T00:00:00.000Z");
  assert.equal(requests[2].body.data.validUntil, undefined);
  assert.ok(state.rows.every((row) => row.status === "success"));
});

test("the system date is resolved at issuance, not when the panel opens", async () => {
  let today = "2026-11-12";
  const { run, requests } = setup({ getTodayDateInputValue: () => today });
  today = "2026-11-13";
  await run();
  for (const { body } of requests) {
    assert.equal(body.data.issueDate, "2026-11-13T00:00:00.000Z");
    assert.equal(body.data.signedDate, "2026-11-13T00:00:00.000Z");
    assert.equal(body.data.validFrom, "2026-11-13T00:00:00.000Z");
    assert.equal(body.data.validUntil, undefined);
  }
});

test("batch issuance no longer renders date or validity inputs", () => {
  const inputs = [];
  function collectInputs(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "input") {
      inputs.push(node.getText(source));
    }
    ts.forEachChild(node, collectInputs);
  }
  collectInputs(source);
  assert.ok(inputs.some((input) => input.includes('type="file"')));
  assert.ok(inputs.every((input) => !/type="(?:date|checkbox)"/.test(input)));
});
