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
  assert.equal(requests[0].statusProfile, "bitstring");
  assert.equal(requests[0].renderMethod, "embedded");
  assert.equal(issued.length, 1);
  assert.equal(issued[0].certificate.proof.proofValue, "signed");
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
  for (const file of ["app/insurance/page.tsx", "app/gallery/page.tsx", "app/verify/page.tsx"]) {
    const source = sourceFile(file);
    const button = findNode(source, (node) => ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(source) === "CertificatePdfDownload");
    assert.match(button.getText(source), /certificateRef=\{certificatePreviewRef\}/);
    findNode(source, (node) => ts.isJsxAttribute(node) &&
      node.getText(source) === "ref={certificatePreviewRef}");
  }
});
