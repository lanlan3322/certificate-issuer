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
    nodemailer: { createTransport: (config) => {
      calls.push(["transport", config]);
      return { sendMail: async (email) => {
        calls.push(["email", email]);
        if (options.transportError) throw new Error("sensitive provider data");
        return { accepted: options.rejected ? [] : ["recipient@example.com"],
          rejected: options.rejected ? ["recipient@example.com"] : [],
          messageId: options.badPayload ? "" : "message-id" };
      } };
    } },
  };
  new Function("require", "module", "exports", "process", "fetch", "console", code)(
    (name) => { assert.ok(mocks[name], name); return mocks[name]; }, module, module.exports,
    { env: options.unconfigured ? {} : {
      SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "smtp-user",
      SMTP_PASS: "test-secret", EMAIL_FROM: "sender@example.com", ...options.env,
    } },
    () => { assert.fail("SMTP sender must not call the Resend HTTP API"); },
    { error: (...args) => calls.push(["log", ...args]) });
  return {
    calls, record,
    post: (body = { credentialId: id, requestId }, origin = "https://verifiable.sg") => module.exports.POST(
      new Request("https://verifiable.sg/api/credentials/send/", {
        method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
        body: typeof body === "string" ? body : JSON.stringify(body),
      })),
  };
}

test("sends stored signed JSON through shared SMTP settings only to the scoped recipient", async () => {
  const app = setup();
  const response = await app.post({ credentialId: id, requestId, recipientEmail: "attacker@example.com", credential: { forged: true } });
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /accepted for delivery/);
  assert.deepEqual(app.calls.find(([type]) => type === "get"), ["get", id, "issuer-a"]);
  const [, config] = app.calls.find(([type]) => type === "transport");
  assert.equal(config.host, "smtp.example.com");
  assert.equal(config.port, 587);
  assert.equal(config.secure, false);
  assert.equal(config.requireTLS, true);
  assert.deepEqual(config.auth, { user: "smtp-user", pass: "test-secret" });
  assert.equal(config.logger, false);
  assert.equal(config.debug, false);
  assert.equal(config.disableFileAccess, true);
  assert.equal(config.disableUrlAccess, true);
  const [, email] = app.calls.find(([type]) => type === "email");
  assert.equal(email.from, "sender@example.com");
  assert.deepEqual(email.to, ["recipient@example.com"]);
  assert.deepEqual(JSON.parse(email.attachments[0].content.toString()), app.record.credential);
  assert.match(email.attachments[0].filename, /^[a-zA-Z0-9_-]+\.json$/);
  assert.match(email.text, /https:\/\/verifiable.sg\/privacy/);
  assert.match(email.text, /https:\/\/verifiable.sg\/terms/);
  assert.equal(email.messageId, `<certificate-${id}-${requestId}@verifiable.sg>`);
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
    [{ env: { SMTP_PORT: "invalid" } }, 503], [{ env: { SMTP_PORT: "0" } }, 503],
    [{ env: { SMTP_PORT: "65536" } }, 503], [{ env: { SMTP_PASS: "" } }, 503],
    [{ record: { credential: { large: "x".repeat(5 * 1024 * 1024) } } }, 413],
  ]) {
    const app = setup(options);
    assert.equal((await app.post()).status, status);
    assert.ok(!app.calls.some(([type]) => type === "email"));
  }
});

test("provider failures never return success or expose provider content", async () => {
  for (const options of [{ rejected: true }, { transportError: true }, { badPayload: true }]) {
    const app = setup(options);
    const response = await app.post();
    assert.equal(response.status, 502);
    assert.ok(!app.calls.some(([type]) => type === "audit"));
    assert.doesNotMatch(JSON.stringify(app.calls.filter(([type]) => type === "log")), /sensitive provider data/);
  }
});

test("port 465 uses implicit TLS and retry identifiers stay stable without claiming SMTP deduplication", async () => {
  const app = setup({ env: { SMTP_PORT: "465" } });
  assert.equal((await app.post()).status, 200);
  assert.equal((await app.post()).status, 200);
  const config = app.calls.find(([type]) => type === "transport")[1];
  assert.equal(config.secure, true);
  assert.equal(config.requireTLS, false);
  const messages = app.calls.filter(([type]) => type === "email").map(([, email]) => email.messageId);
  assert.equal(messages[0], messages[1]);
});

test("actual Nodemailer composes the stored JSON as a MIME attachment without external delivery", async () => {
  const app = setup();
  assert.equal((await app.post()).status, 200);
  const mail = app.calls.find(([type]) => type === "email")[1];
  const { createTransport } = require("nodemailer");
  const result = await createTransport({ streamTransport: true, buffer: true }).sendMail(mail);
  const mime = result.message.toString();
  assert.match(mime, /Content-Type: application\/json; name=/);
  assert.match(mime, /Content-Disposition: attachment;/);
  assert.match(mime, /To: recipient@example.com/);
  assert.match(mime, /From: sender@example.com/);
  const encoded = mail.attachments[0].content.toString("base64");
  assert.ok(mime.replace(/\r?\n/g, "").includes(encoded));
});
