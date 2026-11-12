const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function setup(user, pathname = "/dashboard/") {
  const states = [], refs = [], effects = [], listeners = {}, routes = [];
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
    "next/navigation": { usePathname: () => pathname, useRouter: () => ({ push: (href) => routes.push(href), refresh() {} }) },
    "./WorkspaceSession": { useWorkspaceSession: () => ({ user, error: null, refresh: async () => {} }) },
    "../lib/navigation": navigationModule.exports,
    "../lib/permissions": require("../lib/permissions.ts"),
    "../lib/site": { withBasePath: (url) => url },
    "./PageLoadingIndicator": { default: () => null },
  };
  new Function("require", "module", "exports", "fetch", "window", "document", code)(
    (name) => dependencies[name] ?? require(name), module, module.exports,
    () => { assert.fail("Rendering and opening navigation must not call an API."); },
    {},
    { documentElement: { classList: { contains: () => false } }, addEventListener(name, callback) { listeners[name] = callback; }, removeEventListener() {} }
  );
  const render = () => { cursor = 0; refCursor = 0; effects.length = 0; return module.exports.default(); };
  return { render, effects, refs, listeners, routes, states };
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
    if (user) assert.match(renderToStaticMarkup(opened), /Issue Credential/);
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

test("signed-in public pages retain marketing navigation without mixing administration into the menu", () => {
  const app = setup({ roles: ["platform_admin"] }, "/platform/");
  find(app.render(), node => node.props?.["aria-label"] === "Open navigation")[0].props.onClick();
  const html = renderToStaticMarkup(app.render());
  for (const label of ["Solutions", "Pricing", "Resources", "Open workspace"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Audit Logs|href="\/billing"|href="\/platform\/dashboard"/);
});

test("same-page identity anchors never leave the page navigation spinner running", () => {
  const app = setup({ roles: ["organization_admin"] }, "/organization-did/");
  find(app.render(), node => node.props?.["aria-label"] === "Open navigation")[0].props.onClick();
  const menu = app.render();
  find(menu, node => node.props?.href === "/organization-did#managed-did")[0].props.onNavigate();
  assert.equal(app.states[3], false);
  find(menu, node => node.props?.href === "/document-stores")[0].props.onNavigate();
  assert.equal(app.states[3], true);
});

test("issuance shortcut is available on public and workspace pages only with issue permission", () => {
  const cases = [
    [null, false], [{ roles: ["viewer"] }, false],
    [{ roles: ["organization_admin"] }, false], [{ roles: ["issuer"] }, true],
    [{ roles: ["issuer"], issuerMemberships: [{ issuerId: "id", role: "viewer" }] }, false],
    [{ roles: ["platform_admin"] }, true],
  ];
  for (const pathname of ["/release-notes/", "/dashboard/"]) for (const [user, allowed] of cases) {
    const app = setup(user, pathname);
    const desktop = find(app.render(), node => node.props?.href === "/insurance");
    assert.equal(desktop.length, allowed ? 1 : 0);
    if (allowed) assert.equal(desktop[0].props.children, "Issue Credentials");
    find(app.render(), node => node.props?.["aria-label"] === "Open navigation")[0].props.onClick();
    const links = find(app.render(), node => node.props?.href === "/insurance");
    assert.equal(links.length, allowed ? 2 : 0);
    if (allowed) { links[1].props.onNavigate(); assert.equal(app.states[0], false); }
  }
});
