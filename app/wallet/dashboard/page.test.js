const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function harness() {
  const states = [], refs = [], effects = [], calls = [];
  let stateCursor = 0, refCursor = 0;
  const credential = { id: "00000000-0000-4000-8000-000000000001", externalId: "id-1", title: "Course", issuer: "Academy",
    organization: "Org", recipientName: "Holder", issuedAt: "2026-01-01", validUntil: null, status: "active" };
  const dependencies = {
    react: {
      useState(initial) { const i = stateCursor++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = value; }]; },
      useRef(initial) { return refs[refCursor++] ??= { current: initial }; },
      useEffect(effect) { effects.push(effect); },
    },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "qrcode.react": { QRCodeSVG: () => React.createElement("svg", { "aria-label": "QR code" }) },
    "../../templates/CertificateTemplateRenderer": { default: () => React.createElement("div", null, "Certificate preview") },
    "../../renderer/certificateView": { toCertificateTemplateData: () => ({}) },
    "../../../components/CertificatePdfDownload": { downloadCertificatePdf: async () => { calls.push("pdf"); } },
    "../../../lib/site": { withBasePath: (value) => value, buildVerificationUrl: (origin, id) => `${origin}/verify/?id=${id}` },
    "../../../lib/supabase/client": { getSupabaseBrowserClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) },
    "../../../lib/credential-mapper": { mapVcToCertEntry: () => ({}) },
  };
  const response = (body) => ({ ok: true, status: 200, json: async () => body });
  const fetch = async (url, init) => {
    calls.push([url, init]);
    if (url.includes("?credential=")) return response({ credential, document: { id: "signed" } });
    if (init?.method) return response({ ok: true });
    return response({ userId: "holder", email: "holder@example.com", profile: null, credentials: [credential] });
  };
  const moduleUnderTest = { exports: {} };
  const code = ts.transpileModule(readFileSync(`${__dirname}/page.tsx`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const browser = { location: { origin: "https://verifiable.sg" } };
  new Function("require", "module", "exports", "fetch", "window", "navigator", code)(
    (name) => dependencies[name] ?? require(name), moduleUnderTest, moduleUnderTest.exports, fetch, browser,
    { clipboard: { writeText: async (value) => { calls.push(["copied", value]); } } },
  );
  const render = () => { stateCursor = 0; refCursor = 0; effects.length = 0; return moduleUnderTest.exports.default(); };
  return { render, effects, refs, calls };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((item) => find(item, predicate));
  return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("wallet renders responsive credential cards and unknown professional standing", async () => {
  const app = harness();
  app.render();
  app.effects[0]();
  await settle();
  const page = app.render();
  const html = renderToStaticMarkup(page);
  assert.match(html, /Course/);
  assert.match(html, /Academy/);
  assert.match(html, /Standing is unknown/);
  assert.match(html, /sm:grid-cols-2/);
  assert.match(html, /md:grid-cols-2/);
  assert.match(html, /not a fresh verification/);
  find(page, (node) => node.props?.children === "View credential")[0].props.onClick();
  await settle();
  assert.match(renderToStaticMarkup(app.render()), /Certificate preview/);
  const detail = app.render();
  find(detail, (node) => node.props?.children === "Copy verification link")[0].props.onClick();
  await settle();
  assert.ok(app.calls.some((item) => Array.isArray(item) && item[0] === "copied" && item[1] === "https://verifiable.sg/verify/?id=id-1"));
  assert.ok(app.calls.some((item) => Array.isArray(item) && item[1]?.method === "POST" && JSON.parse(item[1].body).action === "credential.shared"));
  find(app.render(), (node) => node.props?.children === "Generate QR code")[0].props.onClick();
  await settle();
  assert.match(renderToStaticMarkup(app.render()), /QR code/);
  assert.ok(app.calls.some((item) => Array.isArray(item) && item[1]?.method === "POST" && JSON.parse(item[1].body).action === "credential.qr_generated"));
  app.refs[0].current = {};
  find(app.render(), (node) => node.props?.children === "Download PDF")[0].props.onClick();
  await settle();
  assert.ok(app.calls.includes("pdf"));
  assert.ok(app.calls.some((item) => Array.isArray(item) && item[1]?.method === "POST" && JSON.parse(item[1].body).action === "credential.downloaded"));
});
