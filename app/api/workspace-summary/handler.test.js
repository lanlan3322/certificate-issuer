const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

function setup(user, fail = false) {
  const queries = [];
  const mod = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(readFileSync(`${__dirname}/handler.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)((name) => {
    if (name === "next/server") return { NextResponse: { json: (body, options) => ({ body, ...options }) } };
    if (name.endsWith("/apiAuth")) return {
      authorize: async permission => { assert.equal(permission, "credentials.read"); return user ? { user } : { response: { status: 401 } }; },
      errorResponse: (_error, message, status) => ({ status, body: { error: message } }),
    };
    if (name.endsWith("/permissions")) return { isPlatformAdmin: user => user.roles.includes("platform_admin") };
    if (name.endsWith("/supabase/server")) return { getSupabaseServerClient: async () => ({
      from(table) {
        const query = { table, filters: [] }; queries.push(query);
        const chain = {
          select(columns, options) { query.columns = columns; assert.equal(options.head, true); assert.equal(options.count, "exact"); return chain; },
          eq(key, value) { query.filters.push([key, value]); return chain; },
          then(resolve) { return Promise.resolve({ count: fail ? null : 12, error: fail ? {} : null }).then(resolve); },
        };
        return chain;
      },
    }) };
    return require(name);
  }, mod, mod.exports);
  return { GET: mod.exports.GET, queries };
}
test("workspace metrics authorize before querying and retain session-based tenant scope", async () => {
  const anonymous = setup(null);
  assert.equal((await anonymous.GET()).status, 401);
  assert.equal(anonymous.queries.length, 0);
  for (const role of ["organization_admin", "issuer", "viewer", "platform_admin"]) {
    const app = setup({ organizationId: "own-org", roles: [role] });
    const result = await app.GET();
    assert.equal(result.body.credentials, 12);
    assert.equal(result.body.revocations, 12);
    assert.equal(result.headers["Cache-Control"], "private, no-store");
    for (const query of app.queries) {
      const tenantFilters = query.filters.filter(([key]) => ["organization_id", "credentials.organization_id", "id"].includes(key));
      assert.equal(tenantFilters.length, role === "platform_admin" ? 0 : 1);
      if (tenantFilters.length) assert.equal(tenantFilters[0][1], "own-org");
    }
    assert.match(app.queries.find(query => query.table === "verification_logs").columns, /credentials!inner/);
  }
});
test("unavailable metrics never become success-shaped zero counts", async () => {
  const result = await setup({ organizationId: "org", roles: ["issuer"] }, true).GET();
  assert.equal(result.status, 503);
  assert.match(result.body.error, /unavailable/);
  assert.equal(result.body.credentials, undefined);
});
