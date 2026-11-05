const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function setup(user, agentAvailable = false) {
  const states = [], refs = [], effects = [], listeners = {}, events = [], routes = [];
  let cursor = 0, refCursor = 0;
  const navigationModule = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(readFileSync(`${__dirname}/../lib/navigation.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText)(() => require("../lib/permissions.ts"), navigationModule, navigationModule.exports);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(`${__dirname}/NavBar.tsx`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const dependencies = {
    react: {
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useRef() { return refs[refCursor++] ??= { current: null }; },
      useEffect(effect) { effects.push(effect); },
    },
    "next/link": { default: ({ prefetch, onNavigate, ...props }) => React.createElement("a", props) },
    "next/navigation": { usePathname: () => "/dashboard/", useRouter: () => ({ push: (href) => routes.push(href), refresh() {} }) },
    "./WorkspaceSession": { useWorkspaceSession: () => ({ user, error: null, refresh: async () => {} }) },
    "../lib/navigation": navigationModule.exports,
    "../lib/site": { withBasePath: (url) => url },
    "./PageLoadingIndicator": { default: () => null },
  };
  new Function("require", "module", "exports", "fetch", "window", "document", code)(
    (name) => dependencies[name] ?? require(name), module, module.exports,
    () => { assert.fail("Rendering and opening navigation must not call an API."); },
    { dispatchEvent: (event) => events.push(event.type) },
    { documentElement: { classList: { contains: () => false } }, addEventListener(name, callback) { listeners[name] = callback; }, removeEventListener() {} }
  );
  const render = () => { cursor = 0; refCursor = 0; effects.length = 0; return module.exports.default({ agentAvailable }); };
  return { render, effects, refs, listeners, events, routes };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}

test("navigation shares the server session, labels mobile controls and disables background prefetch", () => {
  for (const user of [null, { displayName: "Issuer", email: "issuer@example.com", roles: ["issuer"] }]) {
    const app = setup(user);
    const page = app.render();
    assert.match(renderToStaticMarkup(page), /Skip to main content/);
    const trigger = find(page, (node) => node.props?.["aria-label"] === "Open navigation")[0];
    assert.equal(trigger.props["aria-expanded"], false);
    app.effects.forEach((effect) => effect());
    trigger.props.onClick();
    const opened = app.render();
    assert.match(renderToStaticMarkup(opened), /aria-label="Mobile navigation"/);
    for (const link of find(opened, (node) => node.props?.prefetch !== undefined)) assert.equal(link.props.prefetch, false);
    if (user) assert.match(renderToStaticMarkup(opened), /Issue credentials/);
  }
});

test("mobile navigation closes on Escape and restores trigger focus", () => {
  const app = setup(null);
  find(app.render(), (node) => node.props?.["aria-label"] === "Open navigation")[0].props.onClick();
  app.render();
  let focused = false;
  app.refs[2].current = { focus() { focused = true; } };
  app.effects.forEach((effect) => effect());
  app.listeners.keydown({ key: "Escape" });
  assert.equal(focused, true);
  assert.equal(find(app.render(), (node) => node.props?.id === "mobile-navigation").length, 0);
});

test("assistant control is offered only for authenticated users with an available widget", () => {
  for (const user of [null, { roles: ["organization_admin"] }]) for (const available of [true, false]) {
    const app = setup(user, available);
    const button = find(app.render(), (node) => node.props?.["aria-label"] === "Open Issuer Success Agent")[0];
    assert.equal(Boolean(button), Boolean(user && available));
    if (button) { button.props.onClick(); assert.deepEqual(app.events, ["trustvc-agent-open"]); }
  }
});

test("closed assistant does not create database sessions and has no floating launcher", () => {
  const source = readFileSync(`${__dirname}/agent/AgentWidget.tsx`, "utf8");
  assert.match(source, /addEventListener\("trustvc-agent-open", openAgent\)/);
  assert.match(source, /if \(!open \|\| !isAuthenticated\) return;\s*const existing = window.sessionStorage/);
  assert.equal(source.includes("<button"), false);
});
