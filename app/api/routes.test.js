const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, relative);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.endsWith("/api-router")) return load("../../lib/api-router.ts");
    return normalRequire(name);
  };
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true },
  }).outputText, filename);
  return instance.exports;
}

const methods = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];
const groups = [
  {
    route: "auth/[action]/route.ts", prefix: "/api/auth",
    params: (parts) => ({ action: parts.join("/") }),
    endpoints: [
      ["login", "../login/handler", ["POST"]],
      ["logout", "../logout/handler", ["POST"]],
      ["me", "../me/handler", ["POST"]],
      ["reset", "../reset/handler", ["POST"]],
      ["reset-request", "../reset-request/handler", ["POST"]],
    ],
  },
  {
    route: "agent/[[...action]]/route.ts", prefix: "/api/agent",
    params: (parts) => ({ action: parts.length ? parts : undefined }),
    endpoints: [
      ["", "../handler", ["POST"]],
      ["session", "../session/handler", ["GET", "POST", "DELETE"]],
      ["analytics", "../analytics/handler", ["GET", "POST"]],
    ],
  },
  {
    route: "[...resource]/route.ts", prefix: "/api",
    params: (parts) => ({ resource: parts }),
    endpoints: [
      ["credentials", "../credentials/handler", ["GET", "POST", "PATCH"]],
      ["credentials/send", "../credentials/send/handler", ["POST"]],
      ["issuers", "../issuers/handler", ["GET", "POST", "PATCH"]],
      ["issuer-profiles", "../issuer-profiles/handler", ["GET", "POST", "PATCH"]],
      ["templates", "../templates/handler", ["GET", "POST", "DELETE"]],
      ["audit", "../audit/handler", ["GET"]],
      ["revocation", "../revocation/handler", ["GET", "POST"]],
      ["platform/stats", "../platform/stats/handler", ["GET"]],
    ],
  },
];

for (const group of groups) {
  test(`${group.prefix} router preserves exact URL, method, request and response contracts`, async () => {
    const calls = [];
    const mocks = Object.fromEntries(group.endpoints.map(([endpoint, moduleName, supported]) => [
      moduleName,
      {
        runtime: "nodejs", dynamic: "force-dynamic",
        ...Object.fromEntries(supported.map((method) => [method, async (request) => {
          calls.push({ endpoint, method, request });
          return Response.json({ endpoint, method }, {
            status: 202,
            headers: { "Set-Cookie": "session=preserved; HttpOnly", "X-Handler": endpoint },
          });
        }])),
      },
    ]));
    Object.assign(mocks, {
      "../issuers/[id]/handler": {},
      "../organizations/handler": {},
      "../organizations/[id]/handler": {},
    });
    const router = load(group.route, mocks);
    for (const [endpoint, , supported] of group.endpoints) {
      const context = { params: Promise.resolve(group.params(endpoint ? endpoint.split("/") : [])) };
      const allowed = [...new Set([...supported, "OPTIONS", ...(supported.includes("GET") ? ["HEAD"] : [])])].sort();
      for (const method of methods) {
        const request = new Request(`https://example.test${group.prefix}${endpoint ? `/${endpoint}` : ""}/?id=original`, {
          method,
          headers: { cookie: "existing=session", "content-type": "application/json" },
          ...(method === "POST" || method === "PATCH" ? { body: '{"unchanged":true}' } : {}),
        });
        const before = calls.length;
        const response = await router[method](request, context);
        if (method === "OPTIONS" || !allowed.includes(method)) {
          assert.equal(response.status, method === "OPTIONS" ? 204 : 405);
          assert.deepEqual(response.headers.get("allow").split(", "), allowed);
          assert.equal(calls.length, before, "method negotiation must not run a handler");
        } else {
          assert.equal(response.status, 202);
          assert.equal(response.headers.get("set-cookie"), "session=preserved; HttpOnly");
          assert.strictEqual(calls.at(-1).request, request, "cookies, body and query must not be reconstructed");
          assert.equal(calls.at(-1).endpoint, endpoint);
          assert.equal(calls.at(-1).method, method === "HEAD" ? "GET" : method);
          assert.equal(request.bodyUsed, false);
          if (method === "HEAD") assert.equal(await response.text(), "");
          else assert.deepEqual(await response.json(), { endpoint, method });
        }
      }
    }
    for (const unknown of ["missing", "constructor", "toString", "__proto__", "credentials/extra",
      "health/db", "health/supabase", "debug-trustvc"]) {
      const before = calls.length;
      const response = await router.GET(new Request("https://example.test/api/unknown"), {
        params: Promise.resolve(group.params(unknown.split("/"))),
      });
      assert.equal(response.status, 404, unknown);
      assert.equal(calls.length, before);
    }
  });
}

test("consolidated auth runs existing login, logout and password-reset handlers unchanged", async (t) => {
  t.mock.method(console, "info", () => {});
  const user = { id: "user", issuerId: "issuer", organizationId: "org" };
  const calls = [];
  const auth = {
    enforceRateLimit: async (...args) => { calls.push(["rate", ...args]); },
    loginIssuer: async (...args) => { calls.push(["login", ...args]); return user; },
    getCurrentIssuerUser: async () => user,
    logoutIssuer: async () => { calls.push(["logout"]); },
    requestPasswordReset: async (...args) => { calls.push(["reset-request", ...args]); },
    resetPassword: async (...args) => { calls.push(["reset", ...args]); },
  };
  const mocks = {
    "../../../../lib/auth": auth,
    "../../../../lib/apiAuth": {
      clientIp: () => "127.0.0.1",
      errorResponse: (error, _, status = 400) => Response.json({ error: error.message }, { status }),
    },
    "../../../../services/AuditService": { AuditService: {
      record: async (event) => { calls.push(["audit", event]); },
    } },
  };
  const modules = Object.fromEntries(groups[0].endpoints.map(([endpoint, moduleName]) => [
    moduleName, load(`auth/${endpoint}/handler.ts`, mocks),
  ]));
  const router = load(groups[0].route, modules);
  const post = (action, body = {}) => router.POST(new Request(`https://example.test/api/auth/${action}`, {
    method: "POST", body: JSON.stringify(body),
  }), { params: Promise.resolve({ action }) });
  assert.equal((await post("login", {})).status, 400);
  assert.deepEqual(await (await post("login", { email: "test@example.com", password: "synthetic" })).json(), { user });
  assert.deepEqual(calls.find((call) => call[0] === "login"),
    ["login", "test@example.com", "synthetic"]);
  assert.deepEqual(await (await post("me")).json(), { user });
  assert.deepEqual(await (await post("reset-request", { email: "test@example.com" })).json(),
    { message: "If the email is registered, reset instructions have been created." });
  assert.ok(calls.some((call) => call[0] === "reset-request" && call[1] === "test@example.com"));
  assert.deepEqual(await (await post("reset", { password: "new-synthetic" })).json(), { reset: true });
  assert.deepEqual(calls.find((call) => call[0] === "reset"), ["reset", "new-synthetic"]);
  assert.deepEqual(await (await post("logout")).json(), { loggedOut: true });
  assert.equal(calls.filter((call) => call[0] === "rate").length, 3);
  assert.equal(calls.filter((call) => call[0] === "audit").length, 2);
});

test("business consolidation retains handler-level authorization and issuer-admin requirements", async () => {
  const roles = [];
  const denied = Response.json({ error: "Issuer login required." }, { status: 401 });
  const mocks = {
    "../../../../lib/apiAuth": { authorize: async (role) => { roles.push(role); return { response: denied }; } },
    "../../../../lib/auth": { enforceRateLimit: async () => {}, RateLimitError: class extends Error {} },
    "../../../../services/CredentialService": { CredentialService: {} },
    "../../../../services/AuditService": { AuditService: {} },
    "../../../lib/apiAuth": { authorize: async (role) => { roles.push(role); return { response: denied }; } },
    "../../../services/AuditService": { AuditService: {} },
    "../../../services/CredentialService": { CredentialService: {}, DuplicateCredentialError: class extends Error {} },
    "../../../services/IssuerService": { IssuerService: {} },
    "../../../services/IssuerProfileService": { IssuerProfileService: {} },
    "../../../services/TemplateService": { TemplateService: {} },
    "../../../services/RevocationService": { RevocationService: {} },
    "../../../lib/supabase/server": { getSupabaseServerClient: async () => ({}) },
    "../../../lib/did-publication": {
      isRootDidWeb: (did) => /^did:web:[a-z0-9.-]+$/.test(did),
      LEGACY_DID_ID: "did:web:verifiable.sg",
    },
  };
  const modules = Object.fromEntries(groups[2].endpoints.map(([endpoint, moduleName]) => [
    moduleName, endpoint === "platform/stats" ? { GET: async () => Response.json({ public: true }) }
      : load(`${endpoint}/handler.ts`, mocks),
  ]));
  Object.assign(modules, {
    "../issuers/[id]/handler": {},
    "../organizations/handler": {},
    "../organizations/[id]/handler": {},
  });
  const router = load(groups[2].route, modules);
  for (const [endpoint, , supported] of groups[2].endpoints.filter(([endpoint]) => endpoint !== "platform/stats")) {
    for (const method of supported) {
      const response = await router[method](new Request(`https://example.test/api/${endpoint}`, { method }), {
        params: Promise.resolve({ resource: [endpoint] }),
      });
      assert.strictEqual(response, denied);
      assert.equal(
        roles.at(-1),
        endpoint === "issuer-profiles" && method !== "GET"
          ? "issuer-admin"
          : undefined
      );
    }
  }
});

function routeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? routeFiles(path.join(directory, entry.name))
      : entry.name === "route.ts" ? [path.join(directory, entry.name)] : []);
}

test("Hobby budget: eight API entry points, ten app route handlers, no diagnostic functions", () => {
  const routes = routeFiles(__dirname).map((file) => path.relative(__dirname, file).replaceAll("\\", "/")).sort();
  assert.deepEqual(routes, [
    ".well-known/did/route.ts", ".well-known/jwks/route.ts", "[...resource]/route.ts",
    "agent/[[...action]]/route.ts", "auth/[action]/route.ts", "issue/route.ts",
    "status-list/[page]/[purpose]/route.ts", "verify/route.ts",
  ]);
  assert.equal(routeFiles(path.resolve(__dirname, "..")).length, 10);
  assert.ok(routes.length < 12);
});
