const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const exportsUnderTest = {};
new Function("exports", ts.transpileModule(readFileSync(`${__dirname}/api-router.ts`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exportsUnderTest);
const { dispatchApiRequest } = exportsUnderTest;

test("dynamic organization and membership routes dispatch UUIDs without accepting unknown paths", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const routes = {
    "organizations/[id]": { GET: () => Response.json({ organization: true }) },
    "organizations/[id]/members": { POST: () => Response.json({ member: true }, { status: 201 }) },
  };
  assert.equal((await dispatchApiRequest(new Request("https://example.test"), routes, `organizations/${id}`)).status, 200);
  assert.equal((await dispatchApiRequest(new Request("https://example.test", { method: "POST" }), routes, `organizations/${id}/members`)).status, 201);
  for (const path of ["organizations/invalid", `organizations/${"-".repeat(36)}`, `organizations/${id}/extra`, "constructor"]) {
    assert.equal((await dispatchApiRequest(new Request("https://example.test"), routes, path)).status, 404);
  }
});

test("empty root routes and dynamic method negotiation retain existing behavior", async () => {
  const routes = { "": { POST: () => Response.json({ ok: true }) } };
  assert.equal((await dispatchApiRequest(new Request("https://example.test", { method: "POST" }), routes, "")).status, 200);
  const denied = await dispatchApiRequest(new Request("https://example.test"), routes, "");
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get("allow"), "OPTIONS, POST");
});
