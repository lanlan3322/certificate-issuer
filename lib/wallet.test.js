const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const moduleUnderTest = { exports: {} };
new Function("require", "exports", ts.transpileModule(readFileSync(`${__dirname}/wallet.ts`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)((name) => {
  if (name === "./stored-credential") return { parseStoredCredential: (value) => typeof value === "string" ? JSON.parse(value) : value };
  if (name === "./credential-mapper") return { mapVcToCertEntry: () => null };
  if (name === "../app/renderer/certificateView") return { toCertificateTemplateData: () => ({ certificateType: "Certificate", issuerName: "Issuer" }) };
  throw new Error(name);
}, moduleUnderTest.exports);
const { walletStatus, walletRecord } = moduleUnderTest.exports;

test("wallet status respects revocation, suspension, expiry and malformed dates", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(walletStatus("issued", null, now), "active");
  assert.equal(walletStatus("issued", "2025-01-01", now), "expired");
  assert.equal(walletStatus("revoked", "2025-01-01", now), "revoked");
  assert.equal(walletStatus("suspended", null, now), "suspended");
  assert.equal(walletStatus("issued", "invalid", now), "unknown");
  assert.equal(walletStatus("issued", null, now, "2027-01-01"), "not_yet_valid");
  assert.equal(walletStatus("other", null, now), "unknown");
});

test("wallet metadata accepts legacy stored JSON strings without returning the document", () => {
  const record = walletRecord({ id: "id", external_id: "external", recipient_name: "A", credential: '{"proof":"signed"}',
    status: "issued", issued_at: "2026-01-01", issuer_snapshot: { issuerDisplayName: "Department", organizationDisplayName: "Organization" } });
  assert.equal(record.issuer, "Department");
  assert.equal(record.organization, "Organization");
  assert.equal(Object.hasOwn(record, "credential"), false);
});
