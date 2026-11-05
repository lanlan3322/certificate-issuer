const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const organization = { id: "org", name: "Example", displayName: "Example Org", slug: "example",
  status: "active", website: null, logoUrl: null };
const member = { id: "member", userId: "user", organizationId: "org", role: "organization_admin" };
const filename = `${__dirname}/OrganizationWorkspace.tsx`;
const javascript = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function setup(canManage = true, canManageMembers = true) {
  const state = [], requests = [], refreshes = [], events = [];
  let index = 0;
  const normalRequire = createRequire(filename);
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", "window", javascript)((name) => {
    if (name === "react") return { useState(initial) {
      const current = index++;
      if (!(current in state)) state[current] = initial;
      return [state[current], (value) => { state[current] = typeof value === "function" ? value(state[current]) : value; }];
    } };
    if (name === "next/navigation") return { useRouter: () => ({ refresh: () => refreshes.push(true) }) };
    if (name === "../lib/site") return { withBasePath: (url) => `/portal${url}` };
    if (name === "../lib/permissions") return normalRequire(`${name}.ts`);
    return normalRequire(name);
  }, module, module.exports, async (url, options) => {
    requests.push([url, options]);
    return { ok: true, json: async () => url.endsWith("/members")
      ? { members: [member], removed: true } : { organization } };
  }, { dispatchEvent: (event) => events.push(event.type), confirm: () => true });
  return {
    render() { index = 0; return module.exports.default({ initialOrganizations: [organization], canManage, canManageMembers }); },
    requests, refreshes, events,
  };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}
function button(app, label) {
  const found = find(app.render(), (node) => node.type === "button" && node.props.children === label)[0];
  assert.ok(found, `Missing ${label} button`);
  return found;
}

test("platform organization form exposes all requested profile fields", async () => {
  const app = setup();
  button(app, "Create organization").props.onClick();
  const markup = renderToStaticMarkup(app.render());
  for (const field of ["Organization Name", "Display Name", "Slug", "Website", "Logo URL", "Status"]) assert.ok(markup.includes(field));
  for (const field of ["Organization Name", "Display Name", "Slug"]) {
    const label = find(app.render(), (node) => node.type === "label" && node.props.children?.[0] === field)[0];
    find(label, (node) => node.type === "input")[0].props.onChange({ target: { value: "example" } });
  }
  find(app.render(), (node) => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(app.requests[0][0], "/portal/api/organizations");
  assert.equal(app.requests[0][1].method, "POST");
  const body = JSON.parse(app.requests[0][1].body);
  assert.equal(body.name, "example");
  assert.equal(body.displayName, "example");
  assert.equal(body.slug, "example");
  assert.match(renderToStaticMarkup(app.render()), /Organization saved/);
});

test("viewer cannot see lifecycle, membership or global-user mutation controls", async () => {
  const app = setup(false, false);
  await button(app, "View").props.onClick();
  await new Promise(setImmediate);
  const markup = renderToStaticMarkup(app.render());
  assert.doesNotMatch(markup, /Create organization|Deactivate|Add member|Platform users|Remove member/);
  assert.equal(app.requests.length, 1);
});

test("membership self-removal refreshes authorization without an unauthorized follow-up read", async () => {
  const app = setup(false, true);
  button(app, "View").props.onClick();
  await new Promise(setImmediate);
  button(app, "Remove member").props.onClick();
  await new Promise(setImmediate);
  assert.equal(app.requests.length, 3);
  assert.equal(app.requests[2][1].method, "DELETE");
  assert.deepEqual(app.refreshes, [true]);
  assert.deepEqual(app.events, ["trustvc-auth-changed"]);
  assert.match(renderToStaticMarkup(app.render()), /Organization membership updated/);
});
