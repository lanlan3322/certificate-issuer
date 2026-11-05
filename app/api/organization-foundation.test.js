const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");
const permissions = require("../../lib/permissions.ts");
const inputs = require("../../lib/organization-input.ts");
const orgId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000021";

function setup(relative, role = "platform_admin", failure = false) {
  const calls = [];
  const user = role ? { id: userId, organizationId: orgId, issuerId: "", roles: [role] } : null;
  const service = new Proxy({}, { get: (_, method) => async (...args) => {
    calls.push([method, ...args]);
    if (failure) throw new Error("Database unavailable");
    if (method === "list") return [];
    return { id: orgId, ...args.find((arg) => arg && typeof arg === "object") };
  } });
  const filename = path.resolve(__dirname, relative);
  const instance = new Module(filename, module);
  instance.require = (name) => {
    if (name === "next/server") return { NextResponse };
    if (name.endsWith("/permissions")) return permissions;
    if (name.endsWith("/organization-input")) return inputs;
    if (name.endsWith("/OrganizationService")) return { OrganizationService: service };
    if (name.endsWith("/OrganizationMemberService")) return { OrganizationMemberService: service };
    if (name.endsWith("/apiAuth")) return {
      authorize: async (permission) => !user ? { response: NextResponse.json({}, { status: 401 }) } :
        permissions.hasPermission(user, permission) ? { user } : { response: NextResponse.json({}, { status: 403 }) },
      errorResponse: (_error, message, status = 400) => NextResponse.json({ error: message }, { status }),
    };
    throw new Error(`Unexpected dependency ${name}`);
  };
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { handler: instance.exports, calls };
}
const request = (id, method, body, members = false) => new Request(
  `https://verifiable.sg/api/organizations${id ? `/${id}` : ""}${members ? "/members/" : "/"}`,
  { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });

test("organization creation validates profiles and records creator without changing the user workspace", async () => {
  const { handler, calls } = setup("organizations/handler.ts");
  const response = await handler.POST(request("", "POST", {
    name: "Example", displayName: "Example organization", slug: "example",
    website: "https://example.test", logoUrl: "https://example.test/logo.png", createdBy: otherId,
  }));
  assert.equal(response.status, 201);
  assert.equal(calls[0][0], "create");
  assert.equal(calls[0][2], userId);
  assert.equal(calls[0][1].createdBy, undefined);
  assert.equal(calls.some(([method]) => method === "updateUser"), false);
  for (const body of [{ name: "", slug: "example" }, { name: "Example", slug: "bad slug" },
    { name: "Example", slug: "example", logoUrl: "javascript:alert(1)" }]) {
    assert.equal((await handler.POST(request("", "POST", body))).status, 400);
  }
});

test("only platform admins may create, edit or soft-delete organizations", async () => {
  for (const role of ["organization_admin", "issuer", "viewer", null]) {
    const expected = role ? 403 : 401;
    assert.equal((await setup("organizations/handler.ts", role).handler.POST(request("", "POST", {}))).status, expected);
    const { handler, calls } = setup("organizations/[id]/handler.ts", role);
    assert.equal((await handler.PATCH(request(orgId, "PATCH", { status: "disabled" }))).status, expected);
    assert.equal((await handler.DELETE(request(orgId, "DELETE"))).status, expected);
    assert.equal(calls.length, 0);
  }
  const { handler, calls } = setup("organizations/[id]/handler.ts");
  assert.equal((await handler.DELETE(request(orgId, "DELETE"))).status, 200);
  assert.equal(calls[0][0], "update");
  assert.equal(calls[0][2].status, "disabled");
  assert.ok(calls[0][2].softDeletedAt);
});

test("organization reads and membership mutations enforce organization isolation and prevent elevation", async () => {
  const read = setup("organizations/[id]/handler.ts", "organization_admin");
  assert.equal((await read.handler.GET(request(otherId, "GET"))).status, 403);
  const { handler, calls } = setup("organizations/[id]/members/handler.ts", "organization_admin");
  assert.equal((await handler.POST(request(otherId, "POST", { userId, role: "issuer" }, true))).status, 403);
  assert.equal((await handler.POST(request(orgId, "POST", { userId, role: "platform_admin" }, true))).status, 400);
  assert.equal((await handler.POST(request(orgId, "POST", { userId, role: "issuer" }, true))).status, 201);
  assert.deepEqual(calls[0], ["add", orgId, userId, "issuer"]);
  assert.equal((await handler.PATCH(request(orgId, "PATCH", { userId, role: "viewer" }, true))).status, 200);
  assert.equal((await handler.DELETE(request(orgId, "DELETE", { userId }, true))).status, 200);
  for (const role of ["issuer", "viewer"]) {
    const denied = setup("organizations/[id]/members/handler.ts", role);
    assert.equal((await denied.handler.POST(request(orgId, "POST", { userId, role: "viewer" }, true))).status, 403);
    assert.equal(denied.calls.length, 0);
  }
});

test("database failures cannot return successful organization mutations", async () => {
  const { handler } = setup("organizations/[id]/handler.ts", "platform_admin", true);
  assert.equal((await handler.PATCH(request(orgId, "PATCH", { status: "disabled" }))).status, 400);
});
