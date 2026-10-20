const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadService(client) {
  const filename = path.resolve(__dirname, "TemplateService.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => name === "../lib/supabase/server"
    ? { getSupabaseServerClient: async () => client }
    : normalRequire(name);
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true },
  }).outputText, filename);
  return instance.exports.TemplateService;
}

function createClient({ existingProfile = null, activeProfile = true, issuanceTemplate = null } = {}) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, filters: [], payload: undefined };
      calls.push(call);
      const query = {
        select(fields) { call.selectedFields = fields; return query; },
        eq(field, value) { call.filters.push([field, value]); return query; },
        maybeSingle: async () => ({
          data: table === "templates"
            ? call.selectedFields === "issuer_profile_id"
              ? existingProfile
              : issuanceTemplate
            : activeProfile ? { id: "profile-id" } : null,
          error: null,
        }),
        upsert(payload, options) {
          call.payload = payload;
          call.options = options;
          return query;
        },
        single: async () => ({
          data: { id: "template-id", issuer_id: "issuer-id", issuer_profile_id: call.payload.issuer_profile_id,
            slug: "fta", name: "FTA", is_active: true, created_at: "now", definition: {} },
          error: null,
        }),
      };
      return query;
    },
  };
  return { client, calls };
}

test("template upsert binds an active profile and preserves its mapping when omitted", async () => {
  const { client, calls } = createClient({
    existingProfile: { issuer_profile_id: "profile-id" },
  });
  const service = loadService(client);
  const mapped = await service.upsert({
    issuerId: "issuer-id", slug: "fta", name: "FTA", issuerProfileId: "profile-id",
  });
  assert.equal(mapped.issuerProfileId, "profile-id");
  assert.equal(calls.find((call) => call.table === "templates").payload.issuer_profile_id, "profile-id");

  const preserved = await service.upsert({ issuerId: "issuer-id", slug: "fta", name: "FTA" });
  assert.equal(preserved.issuerProfileId, "profile-id");
});

test("template upsert rejects a profile outside its issuer scope", async () => {
  const { client, calls } = createClient({ activeProfile: false });
  const service = loadService(client);
  await assert.rejects(
    service.upsert({
      issuerId: "issuer-id", slug: "fta", name: "FTA", issuerProfileId: "other-profile",
    }),
    /Active issuer profile not found/
  );
  assert.equal(calls.some((call) => call.table === "templates" && call.payload), false);
});

test("issuance template resolution accepts UUIDs and slugs, scoped to the tenant issuer", async () => {
  const issuanceTemplate = {
    id: "00000000-0000-4000-8000-000000000001",
    issuer_id: "issuer-id",
    issuer_profile_id: "profile-id",
    slug: "fta",
    name: "FTA",
    is_active: true,
    created_at: "now",
    definition: {},
  };
  const { client, calls } = createClient({ issuanceTemplate });
  const service = loadService(client);
  const byUuid = await service.getForIssuance(issuanceTemplate.id, "issuer-id");
  assert.equal(byUuid.id, issuanceTemplate.id);
  assert.deepEqual(calls[0].filters, [
    ["issuer_id", "issuer-id"],
    ["id", issuanceTemplate.id],
  ]);
  const bySlug = await service.getForIssuance("fta", "issuer-id");
  assert.equal(bySlug.issuerProfileId, "profile-id");
  assert.deepEqual(calls[1].filters, [
    ["issuer_id", "issuer-id"],
    ["slug", "fta"],
  ]);
});
