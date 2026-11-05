const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function setup(assignedIssuer, { status = "active", softDeletedAt = null, role = "issuer", membership = true, globalAdmin = false, activeIssuer = true } = {}) {
  const filters = [];
  const client = {
    from(table) {
      const query = {
        select() { return query; },
        eq(field, value) { if (table === "issuers") filters.push([field, value]); return query; },
        then(resolve) { return Promise.resolve({ data: table === "issuer_members" && assignedIssuer
          ? [{ issuer_id: assignedIssuer, role: "issuer_operator" }] : [], error: null }).then(resolve); },
        maybeSingle: async () => ({
          data: table === "users"
            ? { id: "profile", organization_id: "org", issuer_id: assignedIssuer,
              roles: globalAdmin ? ["platform-admin"] : ["issuer-operator"], email: "new@example.com" }
            : table === "organizations" ? { id: "org", name: "Academy", status, soft_deleted_at: softDeletedAt }
            : table === "organization_members" ? (membership ? { role } : null)
            : activeIssuer ? { id: assignedIssuer, name: "Academy" } : null,
          error: null,
        }),
      };
      return query;
    },
  };
  const filename = path.resolve(__dirname, "auth.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(__dirname);
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => {
    if (name === "./supabase/server") return { getSupabaseServerClient: async () => client };
    if (name === "./supabase/session") return { getUserSafely: async () => ({ user: { id: "auth" } }) };
    if (name === "./password-policy") return normalRequire("./password-policy.ts");
    if (name === "./site") return normalRequire("./site.ts");
    if (name === "./permissions") return normalRequire("./permissions.ts");
    throw new Error(`Unexpected dependency ${name}`);
  };
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { getUser: instance.exports.getCurrentIssuerUser, filters };
}

test("invited users resolve only their assigned active issuer in their organization", async () => {
  const { getUser, filters } = setup("issuer-b");
  const user = await getUser();
  assert.equal(user.issuerId, "issuer-b");
  assert.deepEqual(filters, [["organization_id", "org"], ["status", "active"], ["id", "issuer-b"]]);
});

test("unassigned issuers cannot silently select another issuer", async () => {
  const { getUser, filters } = setup(null);
  const user = await getUser();
  assert.equal(user.issuerId, "");
  assert.deepEqual(user.issuerMemberships, []);
  assert.equal(filters.some(([field]) => field === "id"), false);
});

test("organization status, soft deletion and membership removal invalidate existing sessions", async () => {
  for (const options of [{ status: "disabled" }, { softDeletedAt: "2026-01-01" }, { membership: false }]) {
    assert.equal(await setup("issuer-b", options).getUser(), null);
  }
});

test("membership role overrides stale user roles and non-issuers need no signing issuer", async () => {
  for (const role of ["viewer", "organization_admin"]) {
    const user = await setup(null, { role }).getUser();
    assert.deepEqual(user.roles, [role]);
    assert.equal(user.issuerId, "");
  }
  assert.equal((await setup("issuer-b", { activeIssuer: false }).getUser()).issuerId, "");
});

test("global admin survives organization deactivation without membership-based elevation", async () => {
  const user = await setup(null, { globalAdmin: true, membership: false, status: "disabled" }).getUser();
  assert.deepEqual(user.roles, ["platform_admin"]);
});
