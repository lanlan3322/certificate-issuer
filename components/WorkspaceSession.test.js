const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const user = { id: "user", organizationId: "org", issuerId: "issuer", displayName: "Example", issuerName: "Example issuer", email: "user@example.com", roles: ["issuer"] };

function setup(initialUser = user) {
  const slots = [], scheduled = [], listeners = {}, calls = [];
  let cursor = 0, response = Promise.resolve({ ok: true, json: async () => ({ user }) });
  const module = { exports: {} };
  const hooks = {
    createContext: () => ({ Provider: "session-provider" }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, index) => !Object.is(dep, slots[i].deps[index]))) slots[i] = { callback, deps };
      return slots[i].callback;
    },
    useEffect(effect, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) {
        scheduled.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
      }
    },
  };
  const source = ts.transpileModule(readFileSync(`${__dirname}/WorkspaceSession.tsx`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", "fetch", "window", source)((name) => {
    if (name === "react") return hooks;
    if (name === "../lib/site") return { withBasePath: (url) => `/base${url}` };
    return require(name);
  }, module, module.exports, (...args) => { calls.push(args); return response; },
  { addEventListener(name, callback) { listeners[name] = callback; }, removeEventListener(name) { delete listeners[name]; } });
  const render = () => {
    cursor = 0;
    const node = module.exports.WorkspaceSessionProvider({ initialUser, children: null });
    scheduled.splice(0).forEach((effect) => effect());
    return node.props.value;
  };
  render();
  return {
    render, calls, listeners,
    respond(value) { response = Promise.resolve(value); },
    defer() { let resolve; response = new Promise((done) => { resolve = done; }); return resolve; },
    seed(value) { initialUser = value; render(); },
    cleanup() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

test("server-seeded session requires zero mount or rerender authentication calls", () => {
  for (const initialUser of [user, null]) {
    const app = setup(initialUser);
    for (let page = 0; page < 5; page++) assert.equal(app.render().user, initialUser);
    assert.equal(app.calls.length, 0);
    app.cleanup();
    assert.equal(app.listeners["trustvc-auth-changed"], undefined);
  }
});

test("concurrent session refreshes and auth events share one base-path-aware request", async () => {
  const app = setup(null), resolve = app.defer();
  const first = app.render().refresh();
  app.listeners["trustvc-auth-changed"]();
  const second = app.render().refresh();
  assert.equal(first, second);
  assert.deepEqual(app.calls, [["/base/api/auth/me", { method: "POST", cache: "no-store" }]]);
  resolve({ ok: true, json: async () => ({ user }) });
  await first;
  assert.deepEqual(app.render().user, user);
});

test("session refresh failures are explicit and fail closed", async () => {
  for (const response of [
    { ok: false, json: async () => ({ error: "Session expired" }) },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => { throw new Error("Invalid response"); } },
  ]) {
    const app = setup();
    app.respond(response);
    await app.render().refresh();
    assert.equal(app.render().user, null);
    assert.ok(app.render().error);
  }
});

test("a stale refresh cannot overwrite newer server authorization", async () => {
  const app = setup(), resolve = app.defer();
  const pending = app.render().refresh();
  app.seed(null);
  resolve({ ok: true, json: async () => ({ user }) });
  await pending;
  assert.equal(app.render().user, null);
  app.respond({ ok: true, json: async () => ({ user: null }) });
  await app.render().refresh();
  assert.equal(app.calls.length, 2);
});

test("workspace shell preserves isolated certificate rendering and provides one main-content target", () => {
  const navModule = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(readFileSync(`${__dirname}/../lib/navigation.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText)(() => require("../lib/permissions.ts"), navModule, navModule.exports);
  const module = { exports: {} };
  let pathname = "/renderer/";
  new Function("require", "module", "exports", ts.transpileModule(readFileSync(`${__dirname}/SiteChrome.tsx`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)((name) => {
    if (name === "next/navigation") return { usePathname: () => pathname };
    if (name === "next/link") return { default: ({ prefetch, ...props }) => React.createElement("a", props) };
    if (name === "./WorkspaceSession") return { useWorkspaceSession: () => ({ user }) };
    if (name === "../lib/navigation") return navModule.exports;
    return require(name);
  }, module, module.exports);
  const props = { header: "HEADER", footer: "FOOTER", widget: "WIDGET", children: React.createElement("main", null, "CONTENT") };
  assert.equal(renderToStaticMarkup(module.exports.default(props)), "<main>CONTENT</main>");
  pathname = "/dashboard/";
  const html = renderToStaticMarkup(module.exports.default(props));
  assert.match(html, /aria-label="Workspace navigation"/);
  assert.match(html, /aria-label="Breadcrumb"/);
  assert.equal((html.match(/id="main-content"/g) ?? []).length, 1);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
});

test("sharing the issuance catalog disables the batch panel's second template request", async () => {
  let enabled = true, effect, calls = 0;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", ts.transpileModule(readFileSync(`${__dirname}/../hooks/useIssuanceTemplates.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText)((name) => {
    if (name === "react") return { useState: (value) => [value, () => {}], useEffect: (callback) => { effect = callback; } };
    return { withBasePath: (url) => url };
  }, module, module.exports, async () => { calls++; return { ok: true, json: async () => ({ templates: [] }) }; });
  for (enabled of [true, false]) { module.exports.useIssuanceTemplates(enabled); effect(); }
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  assert.match(readFileSync(`${__dirname}/BatchIssuePanel.tsx`, "utf8"), /useIssuanceTemplates\(!templateCatalog\)/);
  assert.match(readFileSync(`${__dirname}/../app/insurance/page.tsx`, "utf8"), /templateCatalog=\{/);
});

test("assistant opening coalesces session creation and reuses the stored session across pages", async () => {
  const source = ts.createSourceFile("AgentWidget.tsx", readFileSync(`${__dirname}/agent/AgentWidget.tsx`, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer, effect;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "createDatabaseSession") initializer = node.initializer;
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0].getText(source).includes("const existing = window.sessionStorage")) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(source);
  const store = new Map(), messages = [], sessionRequest = { current: null };
  let calls = 0, resolve;
  const response = new Promise((done) => { resolve = done; });
  const mocks = {
    useCallback: (callback) => callback, sessionRequest, pathname: "/dashboard",
    withBasePath: (url) => `/portal${url}`, SESSION_KEY: "session",
    window: { sessionStorage: { getItem: (key) => store.get(key), setItem: (key, value) => store.set(key, value) } },
    fetch: (url) => { assert.equal(url, "/portal/api/agent/session"); calls++; return response; },
    setMessages: (update) => messages.push(...update([])),
  };
  const evaluate = (node, values) => new Function(...Object.keys(values), `${ts.transpile(`const run = ${node.getText(source)};`, { target: ts.ScriptTarget.ES2022 })}\nreturn run;`)(...Object.values(values));
  const createDatabaseSession = evaluate(initializer, mocks);
  const run = (open) => evaluate(effect, { ...mocks, open, isAuthenticated: true, createDatabaseSession, setDatabaseSessionId() {} })();
  run(false);
  assert.equal(calls, 0);
  const cleanup = run(true);
  run(true);
  assert.equal(calls, 1);
  cleanup();
  resolve({ ok: true, json: async () => ({ session: { id: "session-id" } }) });
  await sessionRequest.current;
  run(true);
  assert.equal(calls, 1);
  assert.equal(store.get("session"), "session-id");
  assert.deepEqual(messages, []);
});
