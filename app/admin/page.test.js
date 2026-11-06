const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const React = require("react");
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

const organizations = [{ id: "org-a", name: "Academy", status: "active" }];
const issuer = {
  id: "issuer-a", organizationId: "org-a", name: "academy", displayName: "Academy Board",
  slug: "academy-board", contactEmail: "admin@example.com", website: "https://academy.example",
  description: "Credential issuer", logoUrl: "", status: "active", createdAt: "2026-01-01",
};

function setup({ roles = ["platform_admin"], responses = {} } = {}) {
  const state = [];
  const hookDeps = [];
  const hookCleanup = [];
  const pendingEffects = [];
  const requests = [];
  const sessionUser = { id: "admin", roles, organizationId: "org-a", issuerId: "issuer-a" };
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
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = hookDeps[index];
      const changed = !previous || !deps || deps.some((value, i) => value !== previous[i]);
      if (changed) {
        if (typeof hookCleanup[index] === "function") hookCleanup[index]();
        hookDeps[index] = deps;
        pendingEffects.push(() => { hookCleanup[index] = effect(); });
      }
    },
  };
  const fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const configured = responses[`${options.method ?? "GET"} ${url}`] ?? responses[url];
    let response = typeof configured === "function" ? await configured(options) : configured;
    if (response instanceof Error) throw response;
    if (!response) {
      if (url.endsWith("/api/organizations")) response = { ok: true, body: { organizations } };
      else if (url.endsWith("/api/issuers")) response = { ok: true, body: { issuers: [issuer] } };
      else if (url.endsWith("/api/issuers/issuer-a/members")) response = { ok: true, body: { members: [] } };
      else if (url.endsWith("/api/issuers/issuer-a")) response = { ok: true, body: { issuer } };
      else response = { ok: true, body: { removed: true } };
    }
    return { ok: response.ok, status: response.status ?? 200, json: async () => response.body };
  };
  const window = { confirm: () => true };
  new Function("require", "module", "exports", "fetch", "window", javascript)(
    (name) => {
      if (name === "react") return react;
      if (name === "../../lib/site") return { withBasePath: (url) => `/portal${url}` };
      if (name === "../../lib/permissions") return normalRequire(`${name}.ts`);
      if (name === "../../components/WorkspaceSession") {
        return { useWorkspaceSession: () => ({ user: sessionUser }) };
      }
      if (name === "../../components/IssuerKeysPanel") {
        return { default: ({ issuerId }) => React.createElement("section", { "aria-label": "Issuer keys", "data-issuer-id": issuerId }) };
      }
      if (name === "next/link") return { default: ({ prefetch, ...props }) => React.createElement("a", props) };
      return normalRequire(name);
    },
    module, module.exports, fetch, window,
  );

  const render = () => {
    cursor = 0;
    return module.exports.default();
  };
  const flushEffects = async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      render();
      const effects = pendingEffects.splice(0);
      if (!effects.length) break;
      effects.forEach((effect) => effect());
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  return {
    render,
    requests,
    async mount() { await flushEffects(); },
    flushEffects,
    html() { return renderToStaticMarkup(render()); },
  };
}

function textContent(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  return textContent(node.props?.children);
}

function elements(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  return [
    ...(predicate(node) ? [node] : []),
    ...elements(node.props?.children, predicate),
  ];
}

function byId(page, id) {
  const match = elements(page, (node) => node.props?.id === id)[0];
  assert.ok(match, `Expected element #${id}`);
  return match;
}

function button(page, label) {
  const match = elements(page, (node) => node.type === "button" && textContent(node).trim() === label)[0];
  assert.ok(match, `Expected button "${label}"`);
  return match;
}

test("admin loads the organization and allowed issuer directory with the configured base path", async () => {
  const app = setup();
  await app.mount();
  assert.deepEqual(app.requests.map(({ url }) => url), ["/portal/api/organizations", "/portal/api/issuers"]);
  const markup = app.html();
  assert.match(markup, /Academy Board/);
  assert.match(markup, /Create issuer/);
  assert.match(markup, /Issuer code \(slug\)/);
});

test("issuer creation submits the new metadata contract without requiring an invitation", async () => {
  let submitted;
  const created = { ...issuer, id: "issuer-new", name: "academy-new", displayName: "New Academy", slug: "new-academy" };
  const app = setup({ responses: {
    "POST /portal/api/issuers": (options) => {
      submitted = JSON.parse(options.body);
      return { ok: true, body: { issuer: created } };
    },
  } });
  await app.mount();
  let page = app.render();
  const values = {
    "issuer-organization": "org-a",
    "issuer-display-name": "New Academy",
    "issuer-name": "academy-new",
    "issuer-slug": "new-academy",
    "issuer-contact-email": "contact@example.com",
    "issuer-website": "https://new.example",
    "issuer-logo-url": "https://new.example/logo.png",
    "issuer-description": "A new issuer",
  };
  for (const [id, value] of Object.entries(values)) {
    byId(page, id).props.onChange({ target: { value } });
    page = app.render();
  }
  elements(page, (node) => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(submitted, {
    organizationId: "org-a",
    name: "academy-new",
    displayName: "New Academy",
    slug: "new-academy",
    contactEmail: "contact@example.com",
    website: "https://new.example",
    description: "A new issuer",
    logoUrl: "https://new.example/logo.png",
    status: "active",
  });
  assert.doesNotMatch(JSON.stringify(submitted), /invitation|role/);
  assert.match(app.html(), /Issuer created/);
  assert.match(app.html(), /aria-label="Issuer keys" data-issuer-id="issuer-new"/);
});

test("editing issuer metadata never submits or transfers organization ownership", async () => {
  let submitted;
  const updated = { ...issuer, displayName: "Updated Academy" };
  const app = setup({ responses: {
    "PATCH /portal/api/issuers/issuer-a": (options) => {
      submitted = JSON.parse(options.body);
      return { ok: true, body: { issuer: updated } };
    },
  } });
  await app.mount();
  button(app.render(), "Edit").props.onClick();
  await app.flushEffects();
  let page = app.render();
  byId(page, "issuer-display-name").props.onChange({ target: { value: "Updated Academy" } });
  page = app.render();
  elements(page, (node) => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(submitted.id, "issuer-a");
  assert.equal(submitted.displayName, "Updated Academy");
  assert.equal(submitted.organizationId, undefined);
  assert.match(app.html(), /Issuer details updated/);
});

test("issuer detail supports member assignment, role changes and removal using existing user IDs", async () => {
  const members = [];
  const requests = [];
  const app = setup({ responses: {
    "GET /portal/api/issuers/issuer-a/members": () => ({ ok: true, body: { members } }),
    "POST /portal/api/issuers/issuer-a/members": (options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      const existing = members.find((member) => member.userId === body.userId);
      if (existing) existing.role = body.role;
      else members.push({ issuerId: "issuer-a", ...body, createdAt: "2026-02-01" });
      return { ok: true, body: { member: members.find((member) => member.userId === body.userId) } };
    },
    "DELETE /portal/api/issuers/issuer-a/members?userId=user-123": { ok: true, body: { removed: true } },
  } });
  await app.mount();
  button(app.render(), "View details").props.onClick();
  await app.flushEffects();
  let page = app.render();
  assert.match(app.html(), /Issuer members/);
  byId(page, "issuer-member-user-id").props.onChange({ target: { value: "user-123" } });
  page = app.render();
  elements(page, (node) => node.type === "form").at(-1).props.onSubmit({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  await app.flushEffects();
  page = app.render();
  assert.match(app.html(), /user-123/);
  assert.deepEqual(requests[0], { userId: "user-123", role: "issuer_operator" });

  byId(page, "member-role-user-123").props.onChange({ target: { value: "issuer_admin" } });
  page = app.render();
  button(page, "Save role").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requests[1], { userId: "user-123", role: "issuer_admin" });

  page = app.render();
  button(page, "Remove").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(app.requests.some(({ url, options }) => url.endsWith("/members?userId=user-123") && options.method === "DELETE"));
  assert.doesNotMatch(app.html(), /user-123/);
});

test("issuer deactivation and platform-only soft deletion use explicit lifecycle endpoints", async () => {
  let patchBody;
  const deleted = { ...issuer, status: "deleted" };
  const app = setup({ responses: {
    "PATCH /portal/api/issuers/issuer-a": (options) => {
      patchBody = JSON.parse(options.body);
      return { ok: true, body: { issuer: { ...issuer, status: patchBody.status } } };
    },
    "DELETE /portal/api/issuers/issuer-a": { ok: true, body: { issuer: deleted } },
  } });
  await app.mount();
  button(app.render(), "Deactivate").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(patchBody.status, "inactive");
  assert.equal(patchBody.organizationId, undefined);
  button(app.render(), "Soft-delete").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(app.requests.some(({ url, options }) => url.endsWith("/api/issuers/issuer-a") && options.method === "DELETE"));
  assert.match(app.html(), /soft-deleted/);

  const organizationAdmin = setup({ roles: ["organization_admin"] });
  await organizationAdmin.mount();
  assert.doesNotMatch(organizationAdmin.html(), /Soft-delete/);
});

test("failed issuer detail requests show an explicit error and unauthorized users cannot manage", async () => {
  const app = setup({ responses: { "/portal/api/issuers": { ok: false, body: { error: "Directory unavailable" } } } });
  await app.mount();
  assert.match(app.html(), /Directory unavailable/);

  const viewer = setup({ roles: ["viewer"] });
  await viewer.mount();
  assert.match(viewer.html(), /Issuer administrator access is required/);
  assert.equal(viewer.requests.length, 0);
});
