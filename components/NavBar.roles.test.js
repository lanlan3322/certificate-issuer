const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const moduleInstance = { exports: {} };
new Function("require", "module", "exports", ts.transpileModule(readFileSync(`${__dirname}/../lib/navigation.ts`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(() => require("../lib/permissions.ts"), moduleInstance, moduleInstance.exports);
const { workspaceNavigation, normalizePagePath, pageNavigation, isWorkspacePage } = moduleInstance.exports;

test("workspace navigation uses the centralized permission matrix for all organization roles", () => {
  const includes = (role, href) => workspaceNavigation({ roles: [role] }).flatMap((group) => group.items).some((item) => item.href === href);
  for (const role of ["platform_admin", "organization_admin", "issuer", "viewer"]) {
    for (const href of ["/dashboard", "/branding", "/profile", "/verification"]) assert.equal(includes(role, href), true);
    assert.equal(includes(role, "/insurance"), ["platform_admin", "issuer"].includes(role));
    assert.equal(includes(role, "/bulk"), ["platform_admin", "issuer"].includes(role));
    for (const href of ["/admin", "/organizations", "/templates/builder", "/audit"]) assert.equal(includes(role, href), ["platform_admin", "organization_admin"].includes(role));
    assert.equal(includes(role, "/platform"), role === "platform_admin");
  }
  assert.deepEqual(workspaceNavigation(null), []);
  const ownOrg = workspaceNavigation({ roles: ["organization_admin"] }).flatMap((group) => group.items).find((item) => item.href === "/organizations");
  assert.equal(ownOrg.label, "My organization");
  assert.ok(includes("issuer-admin", "/admin"));
  assert.ok(includes("issuer-operator", "/insurance"));
});

test("route metadata normalizes trailing slashes and preserves renderer isolation", () => {
  for (const path of ["/dashboard", "/dashboard/"]) {
    assert.equal(pageNavigation(path).label, "Credential overview");
    assert.equal(isWorkspacePage(path), true);
  }
  assert.equal(normalizePagePath(null), "/");
  assert.equal(isWorkspacePage("/renderer/"), false);
  assert.equal(isWorkspacePage("/verify/"), false);
  assert.equal(pageNavigation("/bulk/").label, "Batch data preview");
});

test("workspace access reuses the dashboard with profile and permission-gated issuance actions", () => {
  const source = readFileSync(`${__dirname}/../app/dashboard/page.tsx`, "utf8");
    assert.match(source, /href="\/profile\/"/);
    assert.match(source, /hasPermission\(user, "credentials.issue"\) && <Link/);
    assert.match(source, /Issue credential/);
  assert.match(readFileSync(`${__dirname}/../app/issuer/page.tsx`, "utf8"), /return <DashboardPage \/>/);
});
