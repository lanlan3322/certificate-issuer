const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(filename, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}

function setup(user) {
  const root = path.resolve(__dirname, "../../..");
  const permissions = require(`${root}/lib/permissions.ts`);
  const navigation = load(`${root}/lib/navigation.ts`, { "./permissions": permissions });
  const siteSearch = load(`${root}/lib/agent/site-search.ts`, {
    "../permissions": permissions, "../navigation": navigation, "../marketing": require(`${root}/lib/marketing.ts`),
  });
  const calls = [];
  const handler = load(`${__dirname}/handler.ts`, {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "../../../lib/agent/site-search": siteSearch,
    "../../../lib/agent/guardrails": require(`${root}/lib/agent/guardrails.ts`),
    "../../../lib/agent/local": { createLocalAgentResponse: () => ({ message: "Local fallback" }) },
    "../../../lib/agent/providers": { getAgentProvider: () => ({ respond: async () => { calls.push("provider"); return { message: "provider" }; } }) },
    "../../../lib/auth": { getCurrentIssuerUser: async () => user, enforceRateLimit: async () => {}, RateLimitError: class extends Error {} },
    "../../../lib/apiAuth": { clientIp: () => "127.0.0.1" },
    "../../../services/AgentMemoryService": { AgentMemoryService: {
      ownsSession: async () => true,
      saveConversation: async (...args) => { calls.push(args); },
      saveWorkflowState: async () => {},
    } },
    "../../../services/AuditService": { AuditService: { record: async () => {} } },
  });
  return {
    calls,
    post: message => handler.POST(new Request("https://verifiable.sg/api/agent", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, sessionId: "session", context: { currentPage: "/", roles: ["platform_admin"] } }),
    })),
  };
}

test("page searches bypass the provider and persist role-filtered labeled actions", async () => {
  const admin = setup({ id: "user", roles: ["organization_admin"], issuerMemberships: [] });
  const result = await (await admin.post("Find the billing page")).json();
  assert.equal(result.actions[0].href, "/billing");
  assert.equal(result.actions[0].label, "Billing & usage");
  assert.ok(!admin.calls.includes("provider"));
  const saved = admin.calls.find(call => Array.isArray(call) && call[1] === "assistant");
  assert.equal(saved[3].actions[0].href, "/billing");

  const viewer = setup({ id: "user", roles: ["viewer"], issuerMemberships: [] });
  const restricted = await (await viewer.post("Find the billing page")).json();
  assert.ok(!restricted.actions?.some(action => action.href === "/billing"));
  assert.ok(!viewer.calls.includes("provider"));
});

test("non-search questions retain provider behavior", async () => {
  const app = setup({ id: "user", roles: ["viewer"] });
  assert.equal((await (await app.post("Explain a verifiable credential")).json()).message, "provider");
  assert.ok(app.calls.includes("provider"));
});
