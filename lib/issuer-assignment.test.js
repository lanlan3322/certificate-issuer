const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function setup(assignedIssuer) {
  const filters = [];
  const client = {
    from(table) {
      const query = {
        select() { return query; },
        eq(field, value) { if (table === "issuers") filters.push([field, value]); return query; },
        maybeSingle: async () => ({
          data: table === "users"
            ? { id: "profile", organization_id: "org", issuer_id: assignedIssuer,
              roles: ["issuer-operator"], email: "new@example.com" }
            : { id: assignedIssuer ?? "legacy", name: "Academy" },
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

test("legacy unassigned single-issuer users keep their existing resolution path", async () => {
  const { getUser, filters } = setup(null);
  assert.equal((await getUser()).issuerId, "legacy");
  assert.equal(filters.some(([field]) => field === "id"), false);
});
