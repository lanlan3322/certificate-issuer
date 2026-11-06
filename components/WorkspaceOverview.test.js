const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function setup(role, failed = false) {
  const states = [], effects = [], calls = [];
  let cursor = 0, mounted = false, cleanup;
  const user = role ? { id: "actor", organizationId: "own-org", roles: [role] } : null;
  const fixtures = {
    "/api/workspace-summary": { organizations: 1, issuers: 2, templates: 3, credentials: 42, revocations: 4, verifications: 7 },
    "/api/subscriptions": { limits: { name: "Professional", certificate_limit: 1000 }, subscription: { status: "active", renews_at: null }, usage: { certificatesIssued: 10 } },
    "/api/managed-dids": { identities: [{ did: "did:web:example.com", status: "active" }] },
    "/api/organization-document-stores": { stores: [{ status: "active", connection_status: "ok" }] },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", "fetch", ts.transpileModule(readFileSync(`${__dirname}/WorkspaceOverview.tsx`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText)((name) => {
    if (name === "react") return {
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useEffect(effect) { if (!mounted && !effects.length) effects.push(effect); },
    };
    if (name === "./WorkspaceSession") return { useWorkspaceSession: () => ({ user }) };
    if (name === "./BillingDashboard") return { BillingMetricsPanel: () => React.createElement("section", null, "PLATFORM REVENUE METRICS") };
    if (name === "next/link") return { default: ({ prefetch, ...props }) => React.createElement("a", props) };
    if (name === "../lib/permissions") return require("../lib/permissions.ts");
    if (name === "../lib/site") return { withBasePath: path => `/base${path}` };
    return require(name);
  }, mod, mod.exports, async (url, options) => {
    calls.push({ url, options });
    const body = failed ? { error: "Service unavailable. Contact support." } : fixtures[url.replace("/base", "")];
    assert.ok(body, url);
    return { ok: !failed, json: async () => body };
  });
  const html = () => { cursor = 0; return renderToStaticMarkup(mod.exports.default()); };
  html();
  return { calls, html, async mount() {
    mounted = true;
    for (const effect of effects) cleanup = effect();
    await new Promise(setImmediate);
  }, cleanup() { cleanup?.(); } };
}

test("dashboard summary shows tenant information and keeps billing and infrastructure role-scoped", async () => {
  for (const role of [null, "viewer", "issuer", "organization_admin", "platform_admin"]) {
    const app = setup(role);
    if (role) assert.match(app.html(), /Loading programme summary/);
    await app.mount();
    const html = app.html();
    if (!role) { assert.equal(html, ""); assert.equal(app.calls.length, 0); continue; }
    assert.match(html, /Credentials issued/);
    assert.match(html, />42</);
    const admin = ["organization_admin", "platform_admin"].includes(role);
    assert.equal(html.includes("did:web:example.com"), admin);
    assert.equal(html.includes("Professional"), role === "organization_admin");
    assert.equal(html.includes("PLATFORM REVENUE METRICS"), role === "platform_admin");
    assert.equal(app.calls.some(call => call.url.includes("/api/subscriptions")), role === "organization_admin");
    assert.equal(app.calls.some(call => call.url.includes("/api/managed-dids")), admin);
    app.cleanup();
    assert.ok(app.calls.every(call => call.options.signal.aborted));
  }
});

test("dashboard failures remain explicit and do not render fabricated counts or healthy statuses", async () => {
  const app = setup("organization_admin", true);
  await app.mount();
  const html = app.html();
  assert.match(html, /role="alert"/);
  assert.match(html, /Service unavailable/);
  assert.doesNotMatch(html, />0<|last connection test passed|Professional/);
});
