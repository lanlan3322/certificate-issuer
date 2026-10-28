const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

const id = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
function setup(options = {}) {
  const calls = [];
  class RateLimitError extends Error {}
  const user = { id: "user", issuerId: "issuer-a", organizationId: "org-a", roles: options.roles ?? ["issuer-operator"] };
  const record = {
    id, externalId: "../test/cert", recipientEmail: "recipient@example.com",
    credential: { id: "signed", proof: { proofValue: "unchanged" } }, status: "issued",
    ...options.record,
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(`${__dirname}/handler.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "../../../../lib/apiAuth": {
      authorize: async () => options.anonymous ? { response: Response.json({ error: "Login required" }, { status: 401 }) } : { user },
      errorResponse: (error) => Response.json({ error: error.message }, { status: 429 }),
    },
    "../../../../lib/auth": { RateLimitError, enforceRateLimit: async (...args) => {
      calls.push(["limit", ...args]); if (options.limited) throw new RateLimitError("Too many attempts");
    } },
    "../../../../services/CredentialService": { CredentialService: { get: async (...args) => {
      calls.push(["get", ...args]); return options.missing ? null : record;
    } } },
    "../../../../services/AuditService": { AuditService: { record: async (event) => calls.push(["audit", event]) } },
    "node:crypto": require("node:crypto"),
  };
  new Function("require", "module", "exports", "process", "fetch", "console", code)(
    (name) => { assert.ok(mocks[name], name); return mocks[name]; }, module, module.exports,
    { env: options.unconfigured ? {} : { RESEND_API_KEY: "test-secret", CERTIFICATE_EMAIL_FROM: "sender@example.com" } },
    async (url, init) => {
      calls.push(["email", url, init]);
      if (options.transportError) throw new Error("sensitive provider data");
      return Response.json(options.badPayload ? {} : { id: "message-id" }, { status: options.providerStatus ?? 200 });
    }, { error: (...args) => calls.push(["log", ...args]) });
  return {
    calls, record,
    post: (body = { credentialId: id, requestId }, origin = "https://verifiable.sg") => module.exports.POST(
      new Request("https://verifiable.sg/api/credentials/send/", {
        method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
        body: typeof body === "string" ? body : JSON.stringify(body),
      })),
  };
}

test("sends stored signed JSON only to the scoped record recipient with legal footer and idempotency", async () => {
  const app = setup();
  const response = await app.post({ credentialId: id, requestId, recipientEmail: "attacker@example.com", credential: { forged: true } });
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /accepted for delivery/);
  assert.deepEqual(app.calls.find(([type]) => type === "get"), ["get", id, "issuer-a"]);
  const [, url, init] = app.calls.find(([type]) => type === "email");
  assert.equal(url, "https://api.resend.com/emails");
  const email = JSON.parse(init.body);
  assert.deepEqual(email.to, ["recipient@example.com"]);
  assert.deepEqual(JSON.parse(Buffer.from(email.attachments[0].content, "base64")), app.record.credential);
  assert.match(email.attachments[0].filename, /^[a-zA-Z0-9_-]+\.json$/);
  assert.match(email.text, /https:\/\/verifiable.sg\/privacy/);
  assert.match(email.text, /https:\/\/verifiable.sg\/terms/);
  assert.equal(init.headers["Idempotency-Key"], `certificate-${id}-${requestId}`);
  assert.equal(app.calls.find(([type]) => type === "audit")[1].action, "credential.email.accepted");
});

test("rejects unauthenticated, unauthorized, cross-origin and malformed requests before email", async () => {
  for (const [options, body, origin, status] of [
    [{ anonymous: true }, undefined, undefined, 401],
    [{ roles: ["verifier"] }, undefined, undefined, 403],
    [{}, undefined, "https://evil.example", 403],
    [{}, "{", undefined, 400],
    [{}, { credentialId: "invalid" }, undefined, 400],
  ]) {
    const app = setup(options);
    assert.equal((await app.post(body, origin)).status, status);
    assert.ok(!app.calls.some(([type]) => type === "email"));
  }
});

test("fails closed for missing/cross-issuer records, lifecycle states, configuration and rate limits", async () => {
  for (const [options, status] of [
    [{ missing: true }, 404], [{ record: { status: "revoked" } }, 409],
    [{ record: { status: "suspended" } }, 409], [{ record: { status: "expired" } }, 409],
    [{ record: { validUntil: "2000-01-01" } }, 409],
    [{ record: { recipientEmail: "one@example.com,two@example.com" } }, 422],
    [{ unconfigured: true }, 503], [{ limited: true }, 429],
    [{ record: { credential: { large: "x".repeat(5 * 1024 * 1024) } } }, 413],
  ]) {
    const app = setup(options);
    assert.equal((await app.post()).status, status);
    assert.ok(!app.calls.some(([type]) => type === "email"));
  }
});

test("provider failures never return success or expose provider content", async () => {
  for (const options of [{ providerStatus: 429 }, { transportError: true }, { badPayload: true }]) {
    const app = setup(options);
    const response = await app.post();
    assert.equal(response.status, 502);
    assert.ok(!app.calls.some(([type]) => type === "audit"));
    assert.doesNotMatch(JSON.stringify(app.calls.filter(([type]) => type === "log")), /sensitive provider data/);
  }
});
