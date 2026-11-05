const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");
const permissions = require("./permissions.ts");

function setup(user) {
  const filename = `${__dirname}/apiAuth.ts`;
  const instance = new Module(filename, module);
  instance.require = (name) => {
    if (name === "./auth") return { getCurrentIssuerUser: async () => user };
    if (name === "./permissions") return permissions;
    if (name === "./supabase/server") return {};
    if (name === "next/server") return { NextResponse };
    throw new Error(`Unexpected dependency ${name}`);
  };
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return instance.exports.authorize;
}

test("real API guard enforces each canonical permission and rejects missing sessions", async () => {
  assert.equal((await setup(null)("organizations.manage")).response.status, 401);
  for (const role of ["platform_admin", "organization_admin", "issuer", "viewer"]) {
    const user = { roles: [role], issuerId: "issuer" };
    for (const permission of ["organizations.manage", "members.manage", "users.manage", "issuers.manage", "templates.manage",
      "credentials.read", "credentials.issue", "credentials.revoke", "credentials.send"]) {
      const result = await setup(user)(permission);
      assert.equal(!result.response, permissions.hasPermission(user, permission), `${role}: ${permission}`);
      if (result.response) assert.equal(result.response.status, 403);
    }
  }
  assert.equal((await setup({ roles: ["platform_admin"], issuerId: "" })("credentials.issue")).user.roles[0], "platform_admin");
  assert.equal((await setup({ roles: ["organization_admin"], issuerId: "" })("issuer-admin")).user.roles[0], "organization_admin");
});
