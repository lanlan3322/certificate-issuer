const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

const filename = `${__dirname}/page.tsx`;
const javascript = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

const organizations = [
  { id: "org-a", name: "Academy", slug: "academy", status: "active" },
  { id: "org-b", name: "Institute", slug: "institute", status: "active" },
  { id: "org-c", name: "Disabled organization", slug: "disabled", status: "disabled" },
];
const issuers = [
  { id: "issuer-a", organizationId: "org-a", name: "Issuer Alpha", slug: "alpha", status: "active" },
  { id: "issuer-b", organizationId: "org-b", name: "Issuer Beta", slug: "beta", status: "active" },
];

function setup(responses = {}) {
  const state = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  const module = { exports: {} };
  const normalRequire = createRequire(filename);
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      }];
    },
    useEffect(effect) { effects.push(effect); },
  };
  const fetch = async (url, options) => {
    requests.push(url);
    const configured = responses[url];
    const response = (typeof configured === "function" ? configured(options) : configured) ?? {
      ok: true,
      body: url.endsWith("/organizations") ? { organizations } : { issuers },
    };
    if (response instanceof Error) throw response;
    return { ok: response.ok, json: async () => response.body };
  };
  new Function("require", "module", "exports", "fetch", javascript)(
    (name) => {
      if (name === "react") return react;
      if (name === "../../lib/site") return { withBasePath: (url) => `/portal${url}` };
      return normalRequire(name);
    },
    module, module.exports, fetch
  );
  const render = () => {
    cursor = 0;
    effects.length = 0;
    return module.exports.default();
  };
  return {
    render,
    requests,
    async mount() {
      render();
      effects.splice(0).forEach((effect) => effect());
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

function elements(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  return [
    ...(predicate(node) ? [node] : []),
    ...elements(node.props?.children, predicate),
  ];
}

function clickButton(page, label) {
  const button = elements(page, (node) =>
    node.type === "button" && node.props.children === label
  )[0];
  assert.ok(button, `Button "${label}" must exist`);
  button.props.onClick();
}

test("admin loads organization and issuer dropdowns on mount using the configured base path", async () => {
  const app = setup();
  const initial = renderToStaticMarkup(app.render());
  assert.match(initial, /Loading organizations/);
  assert.match(initial, /Loading issuers/);
  await app.mount();
  assert.deepEqual(app.requests, ["/portal/api/organizations", "/portal/api/issuers"]);
  const page = app.render();
  const selects = elements(page, (node) => node.type === "select");
  assert.match(renderToStaticMarkup(selects[0]), /Academy/);
  assert.match(renderToStaticMarkup(selects[0]), /Institute/);
  assert.doesNotMatch(renderToStaticMarkup(selects[0]), /Disabled organization/);
  const issuerSelect = selects.find((node) => node.props.name === "issuerId");
  assert.match(renderToStaticMarkup(issuerSelect), /Issuer Alpha/);
  assert.match(renderToStaticMarkup(issuerSelect), /Issuer Beta/);
  assert.match(renderToStaticMarkup(issuerSelect), /Current: Academy/);
});

test("organization view filters issuers without discarding the global dropdown list", async () => {
  const app = setup();
  await app.mount();
  clickButton(app.render(), "Switch to Organization");
  const organizationRow = elements(app.render(), (node) =>
    node.type === "div" && node.props.onClick &&
    renderToStaticMarkup(node).includes("Academy")
  )[0];
  assert.ok(organizationRow);
  organizationRow.props.onClick();
  const scoped = renderToStaticMarkup(app.render());
  assert.match(scoped, /Issuer Alpha/);
  assert.doesNotMatch(scoped, /Issuer Beta/);
  clickButton(app.render(), "Switch to Issuer");
  const global = renderToStaticMarkup(app.render());
  assert.match(global, /Issuer Alpha/);
  assert.match(global, /Issuer Beta/);
  assert.equal(app.requests.length, 2);
});

test("failed organization requests are visible rather than appearing as an empty dropdown", async () => {
  const app = setup({
    "/portal/api/organizations": {
      ok: false, body: { error: "Requires the platform-admin role." },
    },
  });
  await app.mount();
  const markup = renderToStaticMarkup(app.render());
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Requires the platform-admin role/);
  assert.match(markup, /Issuer Alpha/);
  assert.doesNotMatch(markup, /No active organizations available/);
});

test("issuer network failures are surfaced while organization options still load", async () => {
  const app = setup({ "/portal/api/issuers": new Error("Issuer request failed") });
  await app.mount();
  const markup = renderToStaticMarkup(app.render());
  assert.match(markup, /Issuer request failed/);
  assert.match(markup, /Academy/);
  assert.doesNotMatch(markup, /No issuers configured yet/);
});

test("empty lists and malformed responses are distinguished", async () => {
  const empty = setup({
    "/portal/api/organizations": { ok: true, body: { organizations: [] } },
    "/portal/api/issuers": { ok: true, body: { issuers: [] } },
  });

  await empty.mount();
  const markup = renderToStaticMarkup(empty.render());
  assert.match(markup, /No active organizations available/);
  assert.match(markup, /No issuers configured yet/);

  const malformed = setup({
    "/portal/api/organizations": { ok: true, body: {} },
    "/portal/api/issuers": { ok: true, body: {} },
  });
  await malformed.mount();
  const errors = renderToStaticMarkup(malformed.render());
  assert.match(errors, /Invalid organization list response/);
  assert.match(errors, /Invalid issuer list response/);
});

test("new issuer form defaults to operator and offers only the two invitation roles", async () => {
  const app = setup();
  await app.mount();
  const select = elements(app.render(), (node) => node.type === "select" && node.props.id === "issuer-role")[0];
  assert.ok(select);
  assert.equal(select.props.value, "issuer-operator");
  assert.deepEqual(elements(select, (node) => node.type === "option").map((node) => node.props.value),
    ["issuer-operator", "issuer-admin"]);
  select.props.onChange({ target: { value: "issuer-admin" } });
  const changed = elements(app.render(), (node) => node.type === "select" && node.props.id === "issuer-role")[0];
  assert.equal(changed.props.value, "issuer-admin");
});

test("issuer creation submits the selected role and confirms the login invitation", async () => {
  let submitted;
  const app = setup({
    "/portal/api/issuers": (options) => {
      if (options?.method !== "POST") return undefined;
      submitted = JSON.parse(options.body);
      return { ok: true, body: { issuer: issuers[0], invitationSent: true } };
    },
  });
  await app.mount();
  const change = (predicate, value) => {
    elements(app.render(), predicate)[0].props.onChange({ target: { value } });
  };
  change((node) => node.type === "select" && node.props.value === "", "org-a");
  change((node) => node.type === "input" && node.props.name === "name", "Academy");
  change((node) => node.type === "input" && node.props.name === "slug", "academy");
  change((node) => node.type === "input" && node.props.name === "contactEmail", "new@example.com");
  change((node) => node.props?.id === "issuer-role", "issuer-admin");
  await elements(app.render(), (node) => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.equal(submitted.role, "issuer-admin");
  assert.equal(submitted.organizationId, "org-a");
  assert.equal(submitted.contactEmail, "new@example.com");
  assert.match(renderToStaticMarkup(app.render()), /Invitation sent to new@example.com with the issuer-admin role/);
});
