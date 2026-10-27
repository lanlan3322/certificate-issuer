const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const user = { id: "self", organizationId: "own-org", issuerId: "own-issuer",
  email: "me@example.com", displayName: "Name", roles: ["issuer-operator"], issuerName: "Academy" };
function setup({ authorized = true, dbError = null } = {}) {
  const calls = [];
  const filename = `${__dirname}/handler.ts`;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(__dirname);
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => {
    if (name === "../../../../lib/apiAuth") return {
      authorize: async () => authorized ? { user } : { response: Response.json({ error: "Login required" }, { status: 401 }) },
      errorResponse: (_error, message, status) => Response.json({ error: message }, { status }),
    };
    if (name === "../../../../lib/supabase/server") return {
      getSupabaseAdmin: () => ({ from(table) {
        const call = { table, filters: [] };
        calls.push(call);
        const query = {
          select(fields) { call.selected = fields; return query; },
          update(values) { call.update = values; return query; },
          eq(field, value) { call.filters.push([field, value]); return query; },
          single: async () => ({ data: table === "users"
            ? { created_at: "created", updated_at: "updated" }
            : { name: "Own Organization" }, error: dbError }),
        };
        return query;
      } }),
    };
    return normalRequire(name);
  };
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { ...instance.exports, calls };
}
const request = (body) => new Request("https://verifiable.sg/api/auth/profile", {
  method: "PATCH", body: JSON.stringify(body),
});

test("profile reads only the authenticated user's details and own organization", async () => {
  const app = setup();
  const response = await app.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual((await response.json()).profile, {
    ...user, organizationName: "Own Organization", createdAt: "created", updatedAt: "updated",
  });
  assert.deepEqual(app.calls.map((call) => call.filters), [
    [["id", "self"]], [["id", "own-org"]],
  ]);
});

test("profile update trims display name and scopes mutation to authenticated user ID", async () => {
  const app = setup();
  const response = await app.PATCH(request({ displayName: " New name " }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { displayName: "New name", updatedAt: "updated" });
  assert.deepEqual(app.calls[0].update, { display_name: "New name" });
  assert.deepEqual(app.calls[0].filters, [["id", "self"]]);
});

test("profile rejects role, identity, email and tenant edits before database access", async () => {
  for (const body of [
    { displayName: "x", roles: ["platform-admin"] }, { displayName: "x", id: "other" },
    { displayName: "x", organizationId: "other" }, { displayName: "x", issuerId: "other" },
    { displayName: "x", email: "other@example.com" }, { displayName: " " },
    { displayName: "x".repeat(101) }, { displayName: 123 }, [], null,
  ]) {
    const app = setup();
    assert.equal((await app.PATCH(request(body))).status, 400);
    assert.deepEqual(app.calls, []);
  }
});

test("profile endpoints deny anonymous access and surface database failures", async () => {
  const denied = setup({ authorized: false });
  assert.equal((await denied.GET()).status, 401);
  assert.equal((await denied.PATCH(request({ displayName: "x" }))).status, 401);
  assert.deepEqual(denied.calls, []);
  const failed = setup({ dbError: new Error("database down") });
  assert.equal((await failed.GET()).status, 500);
  assert.equal((await failed.PATCH(request({ displayName: "x" }))).status, 500);
});
