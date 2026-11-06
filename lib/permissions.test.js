const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const { readFileSync } = require("node:fs");
const moduleUnderTest = { exports: {} };
new Function("exports", ts.transpileModule(readFileSync(`${__dirname}/permissions.ts`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(moduleUnderTest.exports);
const { hasPermission, normalizeRoles, canAccessOrganization } = moduleUnderTest.exports;

test("canonical roles and legacy aliases preserve the Phase 1 permission matrix", () => {
  const permissions = ["organizations.manage", "members.manage", "users.manage", "issuers.manage", "templates.manage",
    "credentials.read", "credentials.issue", "credentials.revoke", "credentials.send"];
  const expected = {
    platform_admin: permissions,
    organization_admin: ["members.manage", "issuers.manage", "templates.manage", "credentials.read"],
    issuer: ["credentials.read", "credentials.issue", "credentials.revoke", "credentials.send"],
    viewer: ["credentials.read"],
  };
  for (const [role, allowed] of Object.entries(expected)) {
    for (const permission of permissions) assert.equal(hasPermission({ roles: [role] }, permission), allowed.includes(permission), `${role}: ${permission}`);
  }
  for (const [alias, canonical] of [["platform-admin", "platform_admin"], ["issuer-admin", "organization_admin"],
    ["issuer-operator", "issuer"], ["verifier", "viewer"]]) {
    assert.deepEqual(normalizeRoles([alias]), [canonical]);
    for (const permission of permissions) assert.equal(hasPermission({ roles: [alias] }, permission), hasPermission({ roles: [canonical] }, permission));
  }
  assert.equal(hasPermission({ roles: ["unknown"] }, "credentials.issue"), false);
  assert.equal(hasPermission(null, "organizations.manage"), false);
});

test("organization access never trusts role names or request organization alone", () => {
  assert.equal(canAccessOrganization({ roles: ["issuer"], organizationId: "a" }, "b"), false);
  assert.equal(canAccessOrganization({ roles: ["organization_admin"], organizationId: "a" }, "a"), true);
  assert.equal(canAccessOrganization({ roles: ["platform_admin"], organizationId: "a" }, "b"), true);
});

test("billing read belongs to organization/platform admins and contract assignment is platform-only",()=>{
  for(const role of ["platform_admin","platform-admin","organization_admin","issuer-admin","issuer","viewer","issuer-operator"]) {
    assert.equal(hasPermission({roles:[role]},"billing.read"),["platform_admin","platform-admin","organization_admin","issuer-admin"].includes(role));
    assert.equal(hasPermission({roles:[role]},"billing.manage"),["platform_admin","platform-admin"].includes(role));
  }
  assert.equal(hasPermission({roles:["issuer"],issuerMemberships:[{issuerId:"issuer",role:"issuer_admin"}]},"billing.read"),false);
});
