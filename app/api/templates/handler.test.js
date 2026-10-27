const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");

function setup({ roles = ["issuer-operator"], authenticated = true, failure = false } = {}) {
  const calls = [];
  const filename = path.resolve(__dirname, "handler.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const mocks = {
    "next/server": { NextResponse },
    "../../../lib/apiAuth": {
      authorize: async () => authenticated
        ? { user: { issuerId: "my-issuer", organizationId: "my-org", roles } }
        : { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) },
      errorResponse: (_error, message, status = 500) => NextResponse.json({ error: message }, { status }),
    },
    "../../../services/AuditService": { AuditService: {} },
    "../../../services/TemplateService": {
      TemplateService: {
        listForIssuance: async (scope) => {
          calls.push(["issuance", scope]);
          if (failure) throw new Error("Database unavailable");
          return [{ id: "saved-template" }];
        },
        list: async (...args) => { calls.push(["builder", ...args]); return []; },
      },
    },
  };
  instance.require = (name) => {
    assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
    return mocks[name];
  };
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { get: (query) => instance.exports.GET(new Request(`https://verifiable.sg/api/templates?${query}`)), calls };
}

test("issuance catalog trusts session organization and roles, not client overrides", async () => {
  for (const roles of [["issuer-admin"], ["issuer-operator"], ["platform-admin"]]) {
    const { get, calls } = setup({ roles });
    const response = await get("purpose=issuance&organizationId=other-org&issuerId=other-issuer&platformAdmin=true&includeInactive=true");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { templates: [{ id: "saved-template" }] });
    assert.deepEqual(calls, [["issuance", { organizationId: "my-org", platformAdmin: roles.includes("platform-admin") }]]);
  }
});

test("builder catalog remains issuer scoped", async () => {
  const { get, calls } = setup();
  assert.equal((await get("issuerId=other-issuer&includeInactive=true")).status, 200);
  assert.deepEqual(calls, [["builder", "my-issuer", { includeInactive: true }]]);
});

test("unauthenticated requests cannot query the catalog and database failures surface", async () => {
  const denied = setup({ authenticated: false });
  assert.equal((await denied.get("purpose=issuance")).status, 401);
  assert.deepEqual(denied.calls, []);
  const failed = setup({ failure: true });
  const response = await failed.get("purpose=issuance");
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Unable to load templates." });
});
