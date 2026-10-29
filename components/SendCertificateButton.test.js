const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

function setup(status = "issued", fail = false) {
  const states = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let open = false;
  const requests = [];
  const module = { exports: {} };
  const dialog = { showModal: () => { open = true; }, close: () => { open = false; } };
  const code = ts.transpileModule(readFileSync(`${__dirname}/SendCertificateButton.tsx`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mocks = {
    react: {
      useId: () => "heading",
      useRef(initial) {
        const key = refIndex++;
        refs[key] ??= { current: key === 0 ? dialog : key === 1 ? { focus() {} } : initial };
        return refs[key];
      },
      useState(initial) {
        const key = stateIndex++;
        if (!(key in states)) states[key] = initial;
        return [states[key], (value) => { states[key] = value; }];
      },
    },
    "../lib/site": { withBasePath: (path) => path },
    "react/jsx-runtime": require("react/jsx-runtime"),
  };
  new Function("require", "module", "exports", "fetch", code)(
    (name) => { assert.ok(mocks[name], name); return mocks[name]; }, module, module.exports,
    async (url, init) => {
      requests.push([url, JSON.parse(init.body)]);
      return Response.json(fail ? { error: "Provider unavailable" } : { message: "Email accepted for delivery." }, { status: fail ? 502 : 200 });
    });
  return {
    render() {
      stateIndex = 0; refIndex = 0;
      return module.exports.default({ credential: { id: "credential", status, recipientName: "Recipient", recipientEmail: "recipient@example.com" } });
    },
    requests, isOpen: () => open,
  };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}
const button = (tree, label) => find(tree, (node) => node.type === "button" && node.props.children === label);

test("Send appears only for ISSUED and cancellation never calls the API", () => {
  for (const status of ["revoked", "suspended", "expired"]) assert.equal(setup(status).render(), null);
  const app = setup("ISSUED");
  button(app.render(), "Send").props.onClick();
  assert.equal(app.isOpen(), true);
  button(app.render(), "Cancel").props.onClick();
  assert.equal(app.isOpen(), false);
  assert.equal(app.requests.length, 0);
});

test("confirmation sends only the credential identifier and reports provider acceptance", async () => {
  const app = setup();
  button(app.render(), "Send").props.onClick();
  const confirm = button(app.render(), "Confirm Send");
  confirm.props.onClick();
  confirm.props.onClick();
  // The event deliberately starts async work without returning its promise.
  await new Promise(setImmediate);
  assert.equal(app.requests.length, 1);
  assert.deepEqual(Object.keys(app.requests[0][1]).sort(), ["credentialId", "requestId"]);
  assert.equal(app.isOpen(), false);
  assert.ok(find(app.render(), (node) => node.props?.role === "status"));
});

test("failed sends stay open, expose errors, and reuse the same request identifier on retry", async () => {
  const app = setup("issued", true);
  button(app.render(), "Send").props.onClick();
  button(app.render(), "Confirm Send").props.onClick();
  await new Promise(setImmediate);
  assert.equal(app.isOpen(), true);
  assert.ok(find(app.render(), (node) => node.props?.role === "alert"));
  button(app.render(), "Confirm Send").props.onClick();
  await new Promise(setImmediate);
  assert.equal(app.requests[0][1].requestId, app.requests[1][1].requestId);
});

test("both pages use the same certificate table with Send in the final column", () => {
  for (const page of ["dashboard", "issuer"]) {
    const source = readFileSync(`${__dirname}/../app/${page}/page.tsx`, "utf8");
    assert.match(source, /<IssuedCertificatesTable credentials=/);
  }
  const table = readFileSync(`${__dirname}/IssuedCertificatesTable.tsx`, "utf8");
  assert.match(table, /<SendCertificateButton credential=\{cred\} \/><\/td>\s*<\/tr>/);
  assert.match(table, />Send<\/th>\s*<\/tr>/);
});
