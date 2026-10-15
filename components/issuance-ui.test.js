const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
function load(relativePath, dependencies = {}) {
  const source = readFileSync(path.join(root, relativePath), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", javascript)(
    (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
    module,
    module.exports
  );
  return module.exports;
}

const constants = load("lib/constants.ts");
const Selector = load("components/IssuingMethodSelector.tsx", {
  "../lib/constants": constants,
}).default;

test("wallet action appears next to Issuing Methods only when Ethereum is selected", () => {
  for (const selectedMethods of [[], ["did"], ["ethereum"], ["did", "ethereum"]]) {
    const html = renderToStaticMarkup(React.createElement(Selector, {
      selectedMethods,
      onToggle() {},
      headerAction: React.createElement("button", null, "Connect MetaMask"),
    }));
    assert.equal(html.includes("Connect MetaMask"), selectedMethods.includes("ethereum"));
    if (selectedMethods.includes("ethereum")) {
      assert.match(html, /Issuing Methods<\/label><button>Connect MetaMask<\/button>/);
    }
  }
});

test("FTA certificate displays date-only values in both date positions", () => {
  const certificateUtils = load("lib/certificate.ts", {
    "./trustvc": {},
    "./constants": constants,
  });
  const Template = load("app/templates/FTATemplate.tsx", {
    "../../lib/certificate": certificateUtils,
  }).default;
  const html = renderToStaticMarkup(React.createElement(Template, {
    certificate: {
      id: "test", recipientName: "Recipient", certificateType: "Course",
      description: "Course description", issueDate: "2026-10-14T08:30:45.000Z",
    },
  }));
  assert.equal((html.match(/14 October 2026/g) ?? []).length, 2);
  assert.doesNotMatch(html, /08:30|T08|\.000Z/);
});

function sourceFile(relativePath) {
  return ts.createSourceFile(relativePath, readFileSync(path.join(root, relativePath), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function findNode(source, predicate) {
  let found;
  function visit(node) {
    if (predicate(node)) found = node;
    else ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, "Expected source node must exist");
  return found;
}

test("Details rows use a wider non-shrinking label column and stack on mobile", () => {
  const source = sourceFile("app/verify/page.tsx");
  const details = findNode(source, (node) => ts.isJsxElement(node) &&
    node.openingElement.getText(source) === '<div className="mt-4 p-4 bg-white rounded-lg">');
  const javascript = ts.transpileModule(`const render = () => (${details.getText(source)});`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const render = new Function("require", "exports", "result", `${javascript}\nreturn render;`)(require, {}, {
    details: {
      verificationMethod: "did:web:verifiable.sg#ecdsa-2026-02",
      signatureVerification: "verified",
      issuerAuthorization: "verified",
      blockchainVerification: "passed",
      blockNumber: 123,
    },
  });
  const html = renderToStaticMarkup(render());
  assert.equal((html.match(/sm:grid-cols-\[14rem_minmax\(0,1fr\)\]/g) ?? []).length, 5);
  assert.equal((html.match(/grid-cols-1/g) ?? []).length, 5);
  assert.doesNotMatch(html, /w-32/);
});

test("single and batch forms no longer expose format or profile selectors", () => {
  for (const file of ["app/insurance/page.tsx", "components/BatchIssuePanel.tsx"]) {
    const source = readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /Certificate Format|Use the opt-in signed|Add a signed embedded renderer/);
  }
});

test("DID-only batches issue without MetaMask using fixed V1, status and rendering settings", async () => {
  const source = sourceFile("components/BatchIssuePanel.tsx");
  const handler = findNode(source, (node) => ts.isVariableDeclaration(node) &&
    node.name.getText(source) === "handleIssueAll");
  const javascript = ts.transpileModule(`const run = ${handler.initializer.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const requests = [];
  let issued = [];
  const dependencies = {
    connected: false, walletRequired: false, issuing: false, hasValidity: false,
    issuingMethods: ["did"], certificateFormat: "v1", DEFAULT_TEMPLATE_ID: "fta",
    rows: [{ recipientName: "Recipient", recipientEmail: "test@example.com",
      certificateType: "Course", description: "Description", errors: [], rowIndex: 1 }],
    setIssuing() {}, onIssuingChange() {}, setParseError() {}, setRows() {},
    onIssuedCertificatesChange(value) { issued = value; },
    getISODateString: () => "2026-10-14T08:30:45Z",
    generateCertificateId: () => "test-id",
    buildVCPayload: () => ({ unsigned: true }),
    setTimeout: (callback) => callback(),
    fetch: async (url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ signed: true,
        credential: { proof: { proofValue: "signed" } } }) };
    },
  };
  const run = new Function(...Object.keys(dependencies), `${javascript}\nreturn run;`)(
    ...Object.values(dependencies)
  );
  await run();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].certificateFormat, "v1");
  assert.equal(requests[0].statusProfile, "bitstring");
  assert.equal(requests[0].renderMethod, "embedded");
  assert.equal(issued.length, 1);
  assert.equal(issued[0].certificate.proof.proofValue, "signed");
});
