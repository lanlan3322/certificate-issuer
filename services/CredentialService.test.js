const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadService(rows, { failureOffset } = {}) {
  const calls = [];
  function client(elevated) {
    return {
      from(table) {
        assert.equal(table, "credentials");
        const call = { elevated, filters: [], orders: [] };
        calls.push(call);
        const query = {
          select: () => query,
          eq(field, value) { call.filters.push([field, value]); return query; },
          order(field, options) { call.orders.push([field, options]); return query; },
          range(start, end) { call.range = [start, end]; return query; },
          then(resolve, reject) {
            const data = rows.filter((row) => call.filters.every(([field, value]) => row[field] === value));
            const error = call.range[0] === failureOffset ? new Error("Database unavailable") : null;
            return Promise.resolve({
              data: error ? null : data.slice(call.range[0], call.range[1] + 1), error,
            }).then(resolve, reject);
          },
        };
        return query;
      },
    };
  }
  const filename = path.resolve(__dirname, "CredentialService.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => {
    if (name === "../lib/supabase/server") return {
      getSupabaseServerClient: async () => client(false),
      getSupabaseAdmin: () => client(true),
    };
    if (name === "../lib/stored-credential") return { parseStoredCredential: (value) => value };
    return normalRequire(name);
  };
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { service: instance.exports.CredentialService, calls };
}

const rows = Array.from({ length: 1205 }, (_, index) => ({
  id: `credential-${index}`, issuer_id: index % 2 ? "other-issuer" : "own-issuer",
  organization_id: index % 4 === 3 ? "other-org" : "own-org",
  external_id: `certificate-${index}`, recipient_name: `Recipient ${index}`,
  recipient_email: `recipient-${index}@example.com`, credential: { type: ["VerifiableCredential"] },
  status: index % 3 ? "issued" : "revoked", issued_at: "2026-11-05T00:00:00Z",
}));

test("credential records expose immutable signer metadata and preserve unknown legacy values",async()=>{
  const {service}=loadService([{...rows[0],issuer_name:"Issuer at issuance",did_used:"did:web:academy.com",
    key_fingerprint:"SHA256:public",key_version:2,signing_key_id:"key-2"},rows[1]]);
  const [current,legacy]=await service.list("own-issuer",{platformAdmin:true});
  assert.equal(current.issuerName,"Issuer at issuance");assert.equal(current.didUsed,"did:web:academy.com");
  assert.equal(current.keyFingerprint,"SHA256:public");assert.equal(current.keyVersion,2);assert.equal(current.signingKeyId,"key-2");
  for(const field of ["issuerName","didUsed","keyFingerprint","keyVersion","signingKeyId"])assert.equal(legacy[field],null);
});

test("platform admins read all issuers beyond the 100, 500 and 1000 record limits", async () => {
  const { service, calls } = loadService(rows);
  const credentials = await service.list("own-issuer", { platformAdmin: true });
  assert.equal(credentials.length, 1205);
  assert.equal(new Set(credentials.map((credential) => credential.id)).size, 1205);
  assert.deepEqual(new Set(credentials.map((credential) => credential.issuerId)), new Set(["own-issuer", "other-issuer"]));
  assert.deepEqual(calls.map((call) => call.range), [[0, 499], [500, 999], [1000, 1499]]);
  assert.ok(calls.every((call) => call.elevated && call.filters.length === 0));
  assert.ok(calls.every((call) => JSON.stringify(call.orders) === JSON.stringify([
    ["issued_at", { ascending: false }], ["id", { ascending: false }],
  ])));
});

test("ordinary listing keeps session RLS, issuer scoping and existing result limits", async () => {
  for (const options of [{}, { platformAdmin: false }, { limit: 5 }, { limit: 1000 }]) {
    const { service, calls } = loadService(rows);
    const credentials = await service.list("own-issuer", options);
    assert.equal(credentials.length, options.limit === undefined ? 100 : Math.min(options.limit, 500));
    assert.ok(credentials.every((credential) => credential.issuerId === "own-issuer"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].elevated, false);
    assert.deepEqual(calls[0].filters, [["issuer_id", "own-issuer"]]);
  }
});

test("organization listing includes sibling issuers but never foreign organization credentials", async () => {
  const { service, calls } = loadService(rows);
  const credentials = await service.list("own-issuer", { organizationId: "own-org", limit: 500 });
  assert.ok(credentials.every((credential) => credential.organizationId === "own-org"));
  assert.deepEqual(new Set(credentials.map((credential) => credential.issuerId)), new Set(["own-issuer", "other-issuer"]));
  assert.deepEqual(calls[0].filters, [["organization_id", "own-org"]]);
  assert.equal(calls[0].elevated, false);
});

test("platform-wide status filters and explicit bounded limits are preserved", async () => {
  const { service, calls } = loadService(rows);
  const credentials = await service.list("own-issuer", { platformAdmin: true, status: "revoked", limit: 20 });
  assert.equal(credentials.length, 20);
  assert.ok(credentials.every((credential) => credential.status === "revoked"));
  assert.deepEqual(calls[0].filters, [["status", "revoked"]]);
  assert.deepEqual(calls[0].range, [0, 19]);
  assert.equal(calls.length, 1);
});

test("platform listing handles empty data and does not return partial success on later page failure", async () => {
  assert.deepEqual(await loadService([]).service.list("own-issuer", { platformAdmin: true }), []);
  const { service } = loadService(rows, { failureOffset: 500 });
  await assert.rejects(service.list("own-issuer", { platformAdmin: true }), /Database unavailable/);
});
