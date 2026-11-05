const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");
const { hasPermission } = require("../../../lib/permissions.ts");
const userId = "00000000-0000-4000-8000-000000000021";

function setup(role = "platform_admin", failureOffset = -1) {
  const calls = [];
  const rows = Array.from({ length: 1201 }, (_, index) => ({ id: `user-${index}`, roles: ["viewer"] }));
  const filename = `${__dirname}/handler.ts`;
  const instance = new Module(filename, module);
  instance.require = (name) => {
    if (name === "next/server") return { NextResponse };
    if (name === "../../../lib/apiAuth") return {
      authorize: async (permission) => role && hasPermission({ roles: [role] }, permission)
        ? { user: { id: userId, roles: [role] } } : { response: NextResponse.json({}, { status: role ? 403 : 401 }) },
      errorResponse: (_error, message, status = 400) => NextResponse.json({ error: message }, { status }),
    };
    if (name === "../../../lib/supabase/server") return { getSupabaseServerClient: async () => ({
      from(table) {
        assert.equal(table, "users");
        const query = {
          select: () => query, order: () => query,
          range: async (start, end) => {
            calls.push([start, end]);
            return { data: rows.slice(start, end + 1), error: start === failureOffset ? new Error("DB unavailable") : null };
          },
        };
        return query;
      },
      rpc: async (...args) => { calls.push(args); return { error: null }; },
    }) };
    throw new Error(`Unexpected dependency ${name}`);
  };
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { handler: instance.exports, calls };
}
const request = (body) => new Request("https://verifiable.sg/api/users", {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

test("platform user directory returns all users beyond the default Supabase row ceiling", async () => {
  const { handler, calls } = setup();
  const response = await handler.GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).users.length, 1201);
  assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499]]);
  assert.equal((await setup("platform_admin", 500).handler.GET()).status, 500);
});

test("user administration rejects tenant roles and delegates global role changes to the restricted RPC", async () => {
  for (const role of ["organization_admin", "issuer", "viewer", null]) {
    const { handler, calls } = setup(role);
    assert.equal((await handler.GET()).status, role ? 403 : 401);
    assert.equal((await handler.PATCH(request({ userId, platformAdmin: true }))).status, role ? 403 : 401);
    assert.deepEqual(calls, []);
  }
  const { handler, calls } = setup();
  assert.equal((await handler.PATCH(request({ userId, platformAdmin: true }))).status, 200);
  assert.deepEqual(calls, [["phase1_set_platform_admin", { p_user: userId, p_enabled: true }]]);
  for (const body of [{ userId: "invalid", platformAdmin: true }, { userId, platformAdmin: "true" }, { userId }]) {
    assert.equal((await handler.PATCH(request(body))).status, 400);
  }
});
