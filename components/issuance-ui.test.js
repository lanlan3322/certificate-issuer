const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const icons = require("lucide-react");
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

test("TrustVC dual issuance registers the unchanged DID credential through MetaMask and reports rejection", async () => {
  for (const rejected of [false, true]) {
  for (const relativePath of ["app/insurance/page.tsx", "app/page.tsx"]) {
    const source = sourceFile(relativePath);
    const handler = findNode(source, (node) => ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "handleIssue");
    const javascript = ts.transpileModule(`const run = ${handler.initializer.getText(source)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const signed = { proof: { proofValue: "did-proof" }, credentialStatus: [] };
    let anchored;
    let requestBody;
    let error;
    let ethereumResult;
    const store = { address: "0x1111111111111111111111111111111111111111", network: "sepolia" };
    const dependencies = {
      issuingMethods: ["did", "ethereum"], connected: true, network: "sepolia",
      formData: { recipientName: "Test", recipientEmail: "test@example.com",
        certificateType: "Course", templateId: "fta", description: "", hasValidity: false },
      validateCertificateData: () => ({ valid: true, errors: [] }),
      validateIssuingMethods: () => ({ valid: true, errors: [] }),
      setErrors: (value) => { error = value; }, setIssuing() {}, setIssuedCert() {},
      setIssuedTxHash() {}, setDIDResult() {}, setEthereumResult(value) {
        ethereumResult = value;
      },
      getISODateString: () => "2026-10-20T00:00:00Z", generateCertificateId: () => "test",
      dateInputToISO: () => null, buildVCPayload: () => { throw new Error("Must reuse DID credential"); },
      getSigner: async () => ({}), switchToSepolia: async () => {},
      signCredentialWithEthereum: async () => { throw new Error("Must not replace DID proof"); },
      getCredentialDocumentStore: (credential) => { assert.strictEqual(credential, signed); return store; },
      issueCertificateToEthereum: async (credential, address) => {
        assert.equal(address, store.address);
        anchored = credential;
        return rejected ? { error: "Transaction rejected by user." } : { credential, txHash: "0xtx" };
      },
      fetch: async (url, options) => {
        requestBody = JSON.parse(options.body);
        return { ok: true, status: 200, json: async () => ({ signed: true, credential: signed,
          documentStore: store, blockchainRegistration: "wallet" }) };
      },
    };
    const run = new Function(...Object.keys(dependencies), `${javascript}\nreturn run;`)(
      ...Object.values(dependencies));
    await run();
    assert.deepEqual(error, []);
    assert.strictEqual(anchored, signed);
    assert.equal(requestBody.statusProfile, "trustvc");
    assert.equal(ethereumResult.error, rejected ? "Transaction rejected by user." : undefined);
    assert.equal(ethereumResult.txHash, rejected ? undefined : "0xtx");
  }
  }
});

test("Ethereum selection requires a connected wallet for the issuance button", () => {
  const source = sourceFile("app/insurance/page.tsx");
  assert.equal(source.text.includes("registration is pending on the platform"), false);
  const issueButton = findNode(source, (node) => ts.isJsxOpeningElement(node) &&
    node.tagName.getText(source) === "button" &&
    node.getText(source).includes("onClick={handleIssue}"));
  assert.match(issueButton.getText(source), /issuingMethods\.includes\("ethereum"\) && !connected/);
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

test("Certificate Preview passes its verification URL to the QR code left of the signature", () => {
  const source = sourceFile("app/insurance/page.tsx");
  const preview = findNode(source, (node) => ts.isJsxSelfClosingElement(node) &&
    node.tagName.getText(source) === "CertificateTemplateRenderer");
  const certificateUtils = load("lib/certificate.ts", {
    "./trustvc": {},
    "./constants": constants,
  });
  const Template = load("app/templates/FTATemplate.tsx", {
    "../../lib/certificate": certificateUtils,
  }).default;
  const { buildVerificationUrl } = load("lib/site.ts");
  const javascript = ts.transpileModule(`const render = () => (${preview.getText(source)});`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  let previewCertificate;
  const render = new Function(
    "require", "exports", "CertificateTemplateRenderer", "issuedCert", "buildVerificationUrl", "window",
    `${javascript}\nreturn render;`
  )(require, {}, ({ certificate }) => {
    previewCertificate = certificate;
    return React.createElement(Template, { certificate });
  }, {
    id: "urn:uuid:preview-test", recipientName: "Recipient", certificateType: "Course",
    description: "Course description", issueDate: "2026-10-14T08:30:45.000Z",
    templateId: "fta",
  }, buildVerificationUrl, { location: { origin: "https://issuer.example" } });
  const html = renderToStaticMarkup(render());
  assert.equal(previewCertificate.verificationUrl,
    buildVerificationUrl("https://issuer.example", "urn:uuid:preview-test"));
  assert.match(html, /grid-cols-\[128px_minmax\(0,1fr\)_160px\]/);
  assert.match(html, /<svg/);
  assert.ok(html.indexOf("<svg") < html.indexOf("L. Koh"));
  assert.ok(html.indexOf("Scan to verify") < html.indexOf("L. Koh"));
});

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
  assert.equal(requests[0].statusProfile, "trustvc");
  assert.equal(requests[0].renderMethod, "embedded");
  assert.equal(issued.length, 1);
  assert.equal(issued[0].certificate.proof.proofValue, "signed");
});

test("Ethereum batches request MetaMask per row and never replace the DID proof", async () => {
  const source = sourceFile("components/BatchIssuePanel.tsx");
  const handler = findNode(source, (node) => ts.isVariableDeclaration(node) &&
    node.name.getText(source) === "handleIssueAll");
  const javascript = ts.transpileModule(`const run = ${handler.initializer.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const rejected of [false, true]) {
    const signed = { proof: { proofValue: "did-proof" } };
    const store = { address: "0x1111111111111111111111111111111111111111", network: "sepolia" };
    let walletRequests = 0;
    let issued = [];
    let rows;
    const dependencies = {
      connected: true, walletRequired: true, issuing: false, hasValidity: false,
      issuingMethods: ["did", "ethereum"], certificateFormat: "v1", DEFAULT_TEMPLATE_ID: "fta",
      rows: [{ recipientName: "Recipient", recipientEmail: "test@example.com",
        certificateType: "Course", description: "", errors: [], rowIndex: 1 }],
      setIssuing() {}, onIssuingChange() {}, setParseError() {},
      setRows(value) { rows = value; },
      onIssuedCertificatesChange(value) { issued = value; },
      getISODateString: () => "2026-10-20T00:00:00Z",
      generateCertificateId: () => "test-id", buildVCPayload: () => ({}),
      switchToSepolia: async () => {}, getSigner: async () => ({}),
      signCredentialWithEthereum: () => { throw new Error("Must preserve DID proof"); },
      issueCertificateToEthereum: async (credential, address) => {
        walletRequests++;
        assert.strictEqual(credential, signed);
        assert.equal(address, store.address);
        return rejected ? { error: "Transaction rejected by user." } : { txHash: "0xbatch" };
      },
      fetch: async () => ({ ok: true, json: async () => ({
        signed: true, credential: signed, documentStore: store,
      }) }),
    };
    const run = new Function(...Object.keys(dependencies), `${javascript}\nreturn run;`)(
      ...Object.values(dependencies));
    await run();
    assert.equal(walletRequests, 1);
    assert.equal(rows[0].status, rejected ? "error" : "success");
    if (rejected) assert.match(rows[0].issueError, /rejected/);
    else {
      assert.equal(rows[0].txHash, "0xbatch");
      assert.strictEqual(issued[0].certificate, signed);
    }
  }
});

test("PDF export fits certificates proportionally on A4 and sanitizes download names", async () => {
  const originalDocument = global.document;
  global.document = { fonts: { ready: Promise.resolve() } };
  try {
    for (const [width, height, expected] of [
      [1200, 600, [0, 96, 210, 105]],
      [600, 1200, [30.75, 0, 148.5, 297]],
    ]) {
      const element = {};
      let savedName;
      let imageArgs;
      let clonedThemeRemoved = false;
      const { downloadCertificatePdf } = load("components/CertificatePdfDownload.tsx", {
        html2canvas: async (target, options) => {
          assert.strictEqual(target, element);
          assert.equal(options.scale, 2);
          options.onclone({ documentElement: { classList: {
            remove(value) { assert.equal(value, "dark"); clonedThemeRemoved = true; },
          } } });
          return { width, height, toDataURL: () => "data:image/png;base64,test" };
        },
        jspdf: { jsPDF: class {
          internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
          addImage(...args) { imageArgs = args; }
          save(name) { savedName = name; }
        } },
      });
      await downloadCertificatePdf(element, " Jane / Doe ");
      assert.deepEqual(imageArgs.slice(2, 6), expected);
      assert.equal(savedName, "certificate-Jane-Doe.pdf");
      assert.equal(clonedThemeRemoved, true);
    }
  } finally {
    global.document = originalDocument;
  }
});

test("PDF download control reports capture failures and always clears its busy state", async () => {
  const originalDocument = global.document;
  global.document = { fonts: { ready: Promise.resolve() } };
  try {
    const state = [];
    let index = 0;
    const Button = load("components/CertificatePdfDownload.tsx", {
      react: { ...React, useState() {
        const position = index++;
        return [position === 0 ? false : null, (value) => { state[position] = value; }];
      } },
      html2canvas: async () => { throw new Error("Capture failed"); },
      jspdf: { jsPDF: class {} },
    }).default;
    const tree = Button({ certificateRef: { current: {} }, recipientName: "Recipient" });
    await tree.props.children[0].props.onClick();
    assert.equal(state[0], false);
    assert.equal(state[1], "Unable to download PDF: Capture failed");
  } finally {
    global.document = originalDocument;
  }
});

test("all certificate views wire PDF download to their certificate capture element", () => {
  for (const file of ["app/insurance/page.tsx", "components/CertificatePreviewModal.tsx", "app/verify/page.tsx"]) {
    const source = sourceFile(file);
    const button = findNode(source, (node) => ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(source) === "CertificatePdfDownload");
    assert.match(button.getText(source), /certificateRef=\{certificatePreviewRef\}/);
    findNode(source, (node) => ts.isJsxAttribute(node) &&
      node.getText(source) === "ref={certificatePreviewRef}");
  }
});

function evaluate(expression, dependencies = {}) {
  const javascript = ts.transpileModule(`const value = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return new Function("require", "exports", ...Object.keys(dependencies), `${javascript}\nreturn value;`)(
    require, {}, ...Object.values(dependencies)
  );
}

const mapper = load("lib/credential-mapper.ts");
const dashboardCredential = {
  id: "database-id", externalId: "certificate-id", recipientName: "Recipient",
  recipientEmail: "test@example.com", status: "issued", issuedAt: "2026-10-14",
  templateId: "fta", credential: {
    issuer: { name: "Academy" }, validFrom: "2026-10-14",
    credentialSubject: {
      name: "Recipient", email: "test@example.com", certificateType: "Training",
      description: "Completed training", issuedOn: "2026-10-14",
      validFrom: "2026-10-14", validUntil: "2027-10-14", templateId: "fta",
    },
  },
};

test("dashboard headers match every cell and revoked rows hide Revoke but retain View", () => {
  const source = sourceFile("app/page.tsx");
  const dashboard = findNode(source, (node) => ts.isIfStatement(node) &&
    node.expression.getText(source) === "user");
  const returned = dashboard.thenStatement.statements.find(ts.isReturnStatement);
  for (const status of ["issued", "revoked", "REVOKED"]) {
    const render = evaluate(`() => (${returned.expression.getText(source)})`, {
      user: { displayName: "Issuer" }, Link: "a", LogOut: icons.LogOut,
      handleLogout() {}, credentialLoading: false, revokeLoading: null,
      allCredentials: [{ ...dashboardCredential, status }],
      mapVcToCertEntry: mapper.mapVcToCertEntry,
      handleViewCredential() {}, handleRevoke() {}, selectedCredential: null,
    });
    const html = renderToStaticMarkup(render());
    const headers = [...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map((match) => match[1]);
    assert.deepEqual(headers, ["Recipient", "Email", "Cert Type", "Status", "Issued", "View", "Actions"]);
    assert.equal((html.match(/<td\b/g) ?? []).length, headers.length);
    assert.match(html, />Training<\/td>/);
    assert.match(html, /title="View certificate details"/);
    assert.equal(html.includes('title="Revoke certificate"'), status === "issued");
  }
});

test("dashboard opens shared preview with nested credential data and public certificate ID", () => {
  const source = sourceFile("app/page.tsx");
  const handler = findNode(source, (node) => ts.isVariableDeclaration(node) &&
    node.name.getText(source) === "handleViewCredential");
  for (const status of ["issued", "revoked"]) {
    let selected;
    evaluate(handler.initializer.getText(source), {
      mapVcToCertEntry: mapper.mapVcToCertEntry,
      setSelectedCredential(value) { selected = value; },
    })({ ...dashboardCredential, status });
    assert.equal(selected.id, "certificate-id");
    assert.equal(selected.recipientName, "Recipient");
    assert.equal(selected.certificateType, "Training");
    assert.equal(selected.description, "Completed training");
    assert.equal(selected.issueDate, "2026-10-14");
    assert.equal(selected.validUntil, "2027-10-14");
    assert.equal(selected.templateId, "fta");
    assert.equal(selected.status, status);
  }
  const page = sourceFile("app/page.tsx");
  findNode(page, (node) => ts.isJsxSelfClosingElement(node) &&
    node.tagName.getText(page) === "CertificatePreviewModal");
});

test("dashboard revocation retains the row after success and reports server failures", async () => {
  const source = sourceFile("app/page.tsx");
  const handler = findNode(source, (node) => ts.isVariableDeclaration(node) &&
    node.name.getText(source) === "handleRevoke");
  for (const ok of [true, false]) {
    let credentials = [dashboardCredential];
    let error;
    let busy;
    const revoke = evaluate(handler.initializer.getText(source), {
      allCredentials: credentials, prompt: () => "Revocation reason",
      setRevokeLoading(value) { busy = value; },
      fetch: async () => ({ ok, json: async () => ({ error: "Not authorized" }) }),
      setAllCredentials(update) { credentials = update(credentials); },
      alert(message) { error = message; },
    });
    await revoke("database-id");
    assert.equal(credentials.length, 1);
    assert.equal(credentials[0].status, ok ? "revoked" : "issued");
    assert.equal(error, ok ? undefined : "Not authorized");
    assert.equal(busy, null);
  }
  const revoke = evaluate(handler.initializer.getText(source), {
    allCredentials: [{ ...dashboardCredential, status: "revoked" }],
    prompt() { assert.fail("Already revoked certificates must not prompt"); },
  });
  await revoke("database-id");
});

test("shared popup preserves gallery layout, PDF capture, verification URL and accurate status", () => {
  const site = load("lib/site.ts");
  let renderedCertificate;
  const Modal = load("components/CertificatePreviewModal.tsx", {
    "../app/templates": {
      CertificateTemplateRenderer({ certificate }) {
        renderedCertificate = certificate;
        return React.createElement("div", null, certificate.description);
      },
      resolveTemplateId: (id) => id,
      TEMPLATE_OPTIONS: [{ id: "fta", label: "FTA" }],
    },
    "../lib/certificate": { formatDate: (value) => value },
    "../lib/site": site,
    "./CertificatePdfDownload": { default: () => React.createElement("button", null, "Download PDF"), __esModule: true },
  }).default;
  for (const status of ["issued", "revoked", "REVOKED"]) {
    const certificate = { ...mapper.mapVcToCertEntry(dashboardCredential.credential), id: "certificate-id", status };
    const html = renderToStaticMarkup(React.createElement(Modal, { certificate, onClose() {} }));
    assert.match(html, /max-w-5xl/);
    assert.match(html, /max-h-\[92vh\] overflow-auto/);
    assert.match(html, /Download PDF/);
    assert.match(html, /Completed training/);
    assert.match(html, /Academy/);
    assert.match(html, /Template: FTA/);
    assert.match(html, /Close certificate preview/);
    assert.equal(html.includes(">Valid</span>"), status === "issued");
    assert.equal(html.includes(">Revoked</span>"), status !== "issued");
    assert.equal(renderedCertificate.verificationUrl, site.buildVerificationUrl("", "certificate-id"));
  }
});
