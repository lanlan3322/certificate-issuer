const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

const filename = `${__dirname}/page.tsx`;
const javascript = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const issuers = [
  { id: "issuer-a", name: "academy", displayName: "Academy Board" },
  { id: "issuer-b", name: "college", displayName: "College Board" },
];
const templates = [{
  id: "template-a", issuerId: "issuer-a", issuerDisplayName: "Academy Board",
  organizationDisplayName: "Academy", slug: "academy", name: "Academy Template",
  description: "An academy credential.", definition: { name: "Academy Template", fields: [] },
  issuerProfileId: null,
}];

function setup(roles = ["organization_admin"]) {
  const state = [];
  const depsList = [];
  const cleanups = [];
  const effects = [];
  const requests = [];
  const module = { exports: {} };
  const user = { id: "user-1", roles, organizationId: "org-a", issuerId: "legacy-issuer" };
  const normalRequire = createRequire(filename);
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useCallback(callback) { cursor++; return callback; },
    useMemo(callback) { cursor++; return callback(); },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = depsList[index];
      if (!previous || !deps || deps.some((value, position) => value !== previous[position])) {
        if (typeof cleanups[index] === "function") cleanups[index]();
        depsList[index] = deps;
        effects.push(() => { cleanups[index] = effect(); });
      }
    },
  };
  const fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/portal/api/templates" && options.method === "POST") {
      return { ok: true, json: async () => ({ template: { id: "created" } }) };
    }
    if (url === "/portal/api/templates") return { ok: true, json: async () => ({ templates }) };
    if (url === "/portal/api/issuers") return { ok: true, json: async () => ({ issuers }) };
    if (url.startsWith("/portal/api/issuer-profiles?issuerId=")) {
      return { ok: true, json: async () => ({ issuerProfiles: [{ id: "profile-a", displayName: "Academy signing", did: "did:web:academy.example" }] }) };
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${url}`);
  };
  new Function("require", "module", "exports", "fetch", javascript)(
    (name) => {
      if (name === "react") return react;
      if (name === "../../../lib/site") return { withBasePath: (url) => `/portal${url}` };
      if (name === "../../../components/WorkspaceSession") return { useWorkspaceSession: () => ({ user }) };
      if (name === "../../../lib/permissions") return normalRequire(`${name}.ts`);
      if (name === "../../../lib/phase3") return {
        createTemplateDefinition: (input) => ({ id: "draft-template", ...input }),
        renderTemplateText: (input) => ({
          title: input.title, subtitle: input.subtitle, description: input.description,
          fields: input.fields.map((field) => ({ key: field.key, label: field.label, value: field.value })),
        }),
      };
      if (name === "../CertificatePaper") return { default: ({ children }) => React.createElement("div", null, children) };
      return normalRequire(name);
    },
    module, module.exports, fetch,
  );
  const render = () => { cursor = 0; return module.exports.default(); };
  const flushEffects = async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      render();
      const pending = effects.splice(0);
      if (!pending.length) break;
      pending.forEach((effect) => effect());
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  return { render, requests, flushEffects, html: () => renderToStaticMarkup(render()) };
}

function elements(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
}

function byId(page, id) {
  const match = elements(page, (node) => node.props?.id === id)[0];
  assert.ok(match, `Expected element #${id}`);
  return match;
}

test("builder chooses an issuer from the allowed directory and scopes profile loading", async () => {
  const app = setup();
  await app.flushEffects();
  let page = app.render();
  const ownerSelect = byId(page, "template-owner-issuer");
  assert.deepEqual(elements(ownerSelect, (node) => node.type === "option").map((option) => option.props.value),
    ["", "issuer-a", "issuer-b"]);
  ownerSelect.props.onChange({ target: { value: "issuer-b" } });
  await app.flushEffects();
  assert.ok(app.requests.some(({ url }) => url === "/portal/api/issuer-profiles?issuerId=issuer-b"));
  assert.doesNotMatch(app.html(), /legacy-issuer/);
});

test("template saves include the selected issuer and saved templates show ownership labels", async () => {
  const app = setup();
  await app.flushEffects();
  let page = app.render();
  byId(page, "template-owner-issuer").props.onChange({ target: { value: "issuer-a" } });
  await app.flushEffects();
  page = app.render();
  const save = elements(page, (node) => node.type === "button" && node.props.children === "Save template")[0];
  assert.ok(save);
  assert.equal(save.props.disabled, false);
  await save.props.onClick();
  const post = app.requests.find(({ url, options }) => url === "/portal/api/templates" && options.method === "POST");
  assert.ok(post);
  assert.equal(JSON.parse(post.options.body).issuerId, "issuer-a");
  assert.match(app.html(), /Academy Board · Academy/);
});

test("users without template-management permission cannot open the builder", () => {
  const app = setup(["viewer"]);
  assert.match(app.html(), /Issuer administrator access is required/);
});
