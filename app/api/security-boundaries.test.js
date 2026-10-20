const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");

function load(filename, mocks) {
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : normalRequire(name);
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true },
  }).outputText, filename);
  return instance.exports;
}

const routeError = (_error, fallback) => NextResponse.json({ error: fallback }, { status: 500 });

test("organization directory requires platform-admin authorization", async () => {
  const calls = [];
  const handler = load(path.resolve(__dirname, "organizations/handler.ts"), {
    "../../../lib/apiAuth": {
      authorize: async (role) => {
        calls.push(["authorize", role]);
        return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
      },
      errorResponse: routeError,
    },
    "../../../services/AuditService": { AuditService: { record: async () => {} } },
    "../../../services/OrganizationService": {
      OrganizationService: { list: async () => { calls.push(["list"]); return []; } },
    },
  });

  const response = await handler.GET();
  assert.equal(response.status, 403);
  assert.deepEqual(calls, [["authorize", "platform-admin"]]);
});

test("organization creation requires platform-admin authorization", async () => {
  const calls = [];
  const handler = load(path.resolve(__dirname, "organizations/handler.ts"), {
    "../../../lib/apiAuth": {
      authorize: async (role) => {
        calls.push(["authorize", role]);
        return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
      },
      errorResponse: routeError,
    },
    "../../../services/AuditService": { AuditService: { record: async () => {} } },
    "../../../services/OrganizationService": {
      OrganizationService: {
        create: async (...args) => { calls.push(["create", ...args]); },
      },
    },
  });
  const response = await handler.POST(new Request("https://verifiable.sg/api/organizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "New org", slug: "new-org" }),
  }));

  assert.equal(response.status, 403);
  assert.deepEqual(calls, [["authorize", "platform-admin"]]);
});

test("organization status changes require platform-admin and a valid status", async () => {
  const calls = [];
  let user;
  const handler = load(path.resolve(__dirname, "organizations/[id]/handler.ts"), {
    "../../../../lib/apiAuth": {
      authorize: async (role) => {
        calls.push(["authorize", role]);
        return user
          ? { user }
          : { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
      },
      errorResponse: routeError,
    },
    "../../../../services/AuditService": {
      AuditService: { record: async (event) => calls.push(["audit", event]) },
    },
    "../../../../services/OrganizationService": {
      OrganizationService: {
        updateStatus: async (...args) => {
          calls.push(["updateStatus", ...args]);
          return { id: args[0], status: args[1] };
        },
      },
    },
  });
  const request = (status) => new Request("https://verifiable.sg/api/organizations/tenant-b", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });

  const denied = await handler.PATCH(request("disabled"));
  assert.equal(denied.status, 403);
  assert.equal(calls.some(([name]) => name === "updateStatus"), false);

  user = { id: "admin-id", roles: ["platform-admin"] };
  const invalid = await handler.PATCH(request("suspended"));
  assert.equal(invalid.status, 400);
  assert.equal(calls.some(([name]) => name === "updateStatus"), false);

  const allowed = await handler.PATCH(request("disabled"));
  assert.equal(allowed.status, 200);
  assert.deepEqual(calls.find(([name]) => name === "updateStatus"), [
    "updateStatus", "tenant-b", "disabled",
  ]);
  assert.equal(calls[0][1], "platform-admin");
});

test("issuer directory scopes issuer-admins to their organization and denies transfers", async () => {
  const calls = [];
  const issuer = {
    id: "issuer-id", organizationId: "tenant-a", name: "Issuer", slug: "issuer",
    contactEmail: "issuer@example.com", status: "active", createdAt: "now",
  };
  const handler = load(path.resolve(__dirname, "issuers/handler.ts"), {
    "../../../lib/apiAuth": {
      authorize: async () => ({
        user: { id: "user-id", issuerId: "issuer-id", organizationId: "tenant-a", roles: ["issuer-admin"] },
      }),
      errorResponse: routeError,
    },
    "../../../services/AuditService": { AuditService: { record: async () => {} } },
    "../../../services/IssuerService": {
      IssuerService: {
        list: async (organizationId) => { calls.push(["list", organizationId]); return [issuer]; },
        transfer: async (...args) => { calls.push(["transfer", ...args]); return issuer; },
      },
    },
    "../../../lib/supabase/server": {
      getSupabaseServerClient: async () => {
        throw new Error("non-admin must not list across organizations");
      },
    },
  });

  const ownList = await handler.GET(new Request("https://verifiable.sg/api/issuers"));
  assert.equal(ownList.status, 200);
  assert.deepEqual(calls, [["list", "tenant-a"]]);

  const crossTenantList = await handler.GET(new Request(
    "https://verifiable.sg/api/issuers?organization_id=tenant-b"
  ));
  assert.equal(crossTenantList.status, 403);

  const transfer = await handler.PATCH(new Request("https://verifiable.sg/api/issuers", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "issuer-id", organizationId: "tenant-b" }),
  }));
  assert.equal(transfer.status, 403);
  assert.equal(calls.some(([name]) => name === "transfer"), false);
});

test("issuer creation is tenant-scoped except for platform-admins", async () => {
  const calls = [];
  let roles = ["issuer-admin"];
  const handler = load(path.resolve(__dirname, "issuers/handler.ts"), {
    "../../../lib/apiAuth": {
      authorize: async () => ({
        user: {
          id: "user-id", issuerId: "issuer-id", organizationId: "tenant-a", roles,
        },
      }),
      errorResponse: routeError,
    },
    "../../../services/AuditService": {
      AuditService: { record: async (event) => calls.push(["audit", event]) },
    },
    "../../../services/IssuerService": {
      IssuerService: {
        create: async (input) => {
          calls.push(["create", input]);
          return { id: "created-issuer", ...input };
        },
      },
    },
    "../../../lib/supabase/server": { getSupabaseServerClient: async () => ({}) },
  });
  const request = (organizationId) => new Request("https://verifiable.sg/api/issuers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Academy", slug: "academy", contactEmail: "issuer@example.com", organizationId,
    }),
  });

  const crossTenant = await handler.POST(request("tenant-b"));
  assert.equal(crossTenant.status, 403);
  assert.equal(calls.some(([name]) => name === "create"), false);

  const ownTenant = await handler.POST(request(undefined));
  assert.equal(ownTenant.status, 201);
  assert.equal(calls.find(([name]) => name === "create")[1].organizationId, "tenant-a");

  roles = ["platform-admin"];
  const adminCrossTenant = await handler.POST(request("tenant-b"));
  assert.equal(adminCrossTenant.status, 201);
  assert.equal(calls.filter(([name]) => name === "create")[1][1].organizationId, "tenant-b");
});

test("auth callback redirects only to safe internal destinations", async (t) => {
  t.mock.method(console, "info", () => {});
  const handler = load(path.resolve(__dirname, "../auth/callback/route.ts"), {
    "../../../lib/supabase/server": {
      getSupabaseServerClient: async () => ({
        auth: {
          exchangeCodeForSession: async () => ({ data: { session: {} }, error: null }),
        },
      }),
    },
    "../../../lib/safe-internal-path": require("../../lib/safe-internal-path.ts"),
  });

  const external = await handler.GET(new Request(
    "https://verifiable.sg/auth/callback?code=valid&next=%2F%2Fattacker.example%2Fpath"
  ));
  assert.equal(external.headers.get("location"), "https://verifiable.sg/issuer/");

  const internal = await handler.GET(new Request(
    "https://verifiable.sg/auth/callback?code=valid&next=%2Fissuer%2Ftemplates%3Ftab%3Dactive"
  ));
  assert.equal(internal.headers.get("location"), "https://verifiable.sg/issuer/templates?tab=active");
});

test("public verification is rate-limited and rejects oversized payloads before parsing", async (t) => {
  t.mock.method(console, "error", () => {});
  const calls = [];
  class TestRateLimitError extends Error {}
  let shouldRateLimit = false;
  const handler = load(path.resolve(__dirname, "verify/route.ts"), {
    "../../../lib/apiAuth": {
      clientIp: () => "203.0.113.25",
    },
    "../../../lib/auth": {
      enforceRateLimit: async (...args) => {
        calls.push(["rateLimit", ...args]);
        if (shouldRateLimit) throw new TestRateLimitError("Too many attempts.");
      },
      RateLimitError: TestRateLimitError,
    },
    "../../../lib/trustvc": {
      createTrustVCDocumentLoader: async () => async () => ({}),
      verifyCredential: async () => ({ valid: false, message: "Invalid" }),
    },
    "../../../lib/safe-document-loader": { createSafeDocumentLoader: () => async () => ({}) },
    "../../../lib/constants": { TRUSTVC_CONFIG: { didUrl: "did:web:verifiable.sg" } },
    "../../../services/CredentialService": {
      CredentialService: { findForPublicVerification: async () => null },
    },
    "../../../services/VerificationService": {
      VerificationService: { log: async () => {} },
    },
  });

  shouldRateLimit = true;
  const rateLimited = await handler.POST(new Request("https://verifiable.sg/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ externalId: "credential-id" }),
  }));
  assert.equal(rateLimited.status, 429);

  shouldRateLimit = false;
  const oversized = await handler.POST(new Request("https://verifiable.sg/api/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(5 * 1024 * 1024 + 1),
    },
    body: "{}",
  }));
  assert.equal(oversized.status, 413);
  const streamOversized = await handler.POST(new Request("https://verifiable.sg/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new Uint8Array(5 * 1024 * 1024 + 1),
  }));
  assert.equal(streamOversized.status, 413);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], ["rateLimit", "verification:ip", "203.0.113.25", 30, 15]);

  const validRequest = await handler.POST(new Request("https://verifiable.sg/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ externalId: "missing-credential" }),
  }));
  assert.equal(validRequest.status, 200);
  assert.equal((await validRequest.json()).verified, false);
});

test("unexpected verification failures return a generic error", async (t) => {
  t.mock.method(console, "error", () => {});
  const handler = load(path.resolve(__dirname, "verify/route.ts"), {
    "../../../lib/apiAuth": { clientIp: () => "203.0.113.25" },
    "../../../lib/auth": {
      enforceRateLimit: async () => { throw new Error("private database detail"); },
      RateLimitError: class TestRateLimitError extends Error {},
    },
    "../../../lib/trustvc": {},
    "../../../lib/safe-document-loader": {},
    "../../../lib/constants": { TRUSTVC_CONFIG: {} },
    "../../../services/CredentialService": {},
    "../../../services/VerificationService": {},
  });

  const response = await handler.POST(new Request("https://verifiable.sg/api/verify", {
    method: "POST",
    body: "{}",
  }));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    valid: false,
    verified: false,
    error: "Unable to verify credential.",
    message: "Unable to verify credential.",
  });
});

test("security headers allow embedding only for the external credential renderer", async () => {
  const config = require("../../next.config.js");
  const { tryToParsePath } = require("next/dist/lib/try-to-parse-path");
  const rules = await config.headers();
  const baselineHeaders = new Map(rules[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
  const framingRule = rules.find(({ headers }) => headers.some(
    ({ key }) => key.toLowerCase() === "x-frame-options"
  ));

  assert.equal(rules[0].source, "/:path*");
  assert.equal(baselineHeaders.get("strict-transport-security"), "max-age=31536000");
  assert.equal(baselineHeaders.get("x-content-type-options"), "nosniff");
  assert.equal(baselineHeaders.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(baselineHeaders.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(baselineHeaders.has("x-frame-options"), false);
  assert.equal(framingRule?.source, "/((?!renderer(?:/|$)).*)");
  assert.deepEqual(framingRule?.headers, [{ key: "X-Frame-Options", value: "DENY" }]);
  const matchesFramingRule = new RegExp(tryToParsePath(framingRule.source).regexStr);
  assert.equal(matchesFramingRule.test("/renderer/"), false);
  assert.equal(matchesFramingRule.test("/verify/"), true);
});

test("static deployment workflow never receives a public-prefixed DID private key", () => {
  const workflow = readFileSync(
    path.resolve(__dirname, "../../.github/workflows/deploy.yml"),
    "utf8"
  );
  assert.equal(workflow.includes("NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE"), false);
  assert.equal(workflow.includes("secrets.DID_PRIVATE_KEY_MULTIBASE"), false);
});
