const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

function load(path, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(`${__dirname}/${path}`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}

const permissions = require("../permissions.ts");
const navigation = load("../navigation.ts", { "./permissions": permissions });
const search = load("site-search.ts", {
  "../marketing": require("../marketing.ts"),
  "../navigation": navigation,
  "../permissions": permissions,
});
const local = load("local.ts", { "./site-search": search, "./guardrails": require("./guardrails.ts"), "./knowledge": require("./knowledge.ts") });
const admin = { roles: ["organization_admin"], issuerMemberships: [] };
const viewer = { roles: ["viewer"], issuerMemberships: [] };

test("page searches return ranked labeled links to workspace, guides and public details", () => {
  for (const [query, href] of [
    ["Where can I find issuer keys?", "/identity-trust#issuer-keys"],
    ["Find the user guide", "/docs/user-manual"],
    ["Open the billing page", "/billing"],
    ["Find the release notes", "/release-notes"],
    ["Find professional associations", "/solutions/professional-associations"],
    ["Where are my issued certificates?", "/credentials"],
  ]) {
    const response = search.searchSitePages(query, admin);
    assert.equal(response.actions?.[0].href, href, query);
    assert.ok(response.actions[0].label);
    assert.match(response.message, /Select a page to open/);
  }
});

test("search respects navigation permissions and reports absent or missing queries", () => {
  for (const user of [viewer, null]) {
    const response = search.searchSitePages("Find the billing page", user);
    assert.ok(!response.actions?.some(action => action.href === "/billing"));
  }
  assert.match(search.searchSitePages("Find a page about zebras", admin).message, /couldn't find/i);
  assert.match(search.searchSitePages("Find a page", admin).message, /Tell me/);
  assert.equal(search.searchSitePages("Issue credential", admin), null);
});

test("local search works during an issuance workflow without consuming its state", () => {
  const context = { currentPage: "/insurance", workflowState: { step: "recipientName" } };
  const result = local.createLocalAgentResponse("Find billing", context, admin);
  assert.equal(result.actions[0].href, "/billing");
  assert.equal(result.workflowState, undefined);
  assert.equal(local.createLocalAgentResponse("Alice Example", context, admin).workflowState.step, "recipientEmail");
  assert.match(local.createLocalAgentResponse("find my private key page", context, admin).message, /never share/i);
});
