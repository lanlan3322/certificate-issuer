const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");

function loadHandler({ user, credentials = [], failure } = {}) {
  const calls = [];
  const filename = path.resolve(__dirname, "handler.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const dependencies = {
    "../../../lib/issuer-access": { requireIssuerAccess: async () => ({}) },
    "../../../services/TemplateService": { TemplateService: {} },
    "../../../lib/permissions": require("../../../lib/permissions.ts"),
    "../../../lib/apiAuth": {
      authorize: async () => user ? { user } : {
        response: NextResponse.json({ error: "Issuer login required." }, { status: 401 }),
      },
      errorResponse: (_error, message, status = 400) => NextResponse.json({ error: message }, { status }),
    },
    "../../../services/AuditService": { AuditService: {} },
    "../../../services/CredentialService": {
      CredentialService: {
        expireOverdue: async (issuerId) => { calls.push(["expireOverdue", issuerId]); },
        list: async (...args) => {
          calls.push(["list", ...args]);
          if (failure) throw failure;
          return credentials;
        },
      },
    },
  };
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : normalRequire(name);
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { handler: instance.exports, calls };
}

test("credential listing requires login before accessing records", async () => {
  const { handler, calls } = loadHandler();
  const response = await handler.GET(new Request("https://verifiable.sg/api/credentials"));
  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});

test("only the session platform-admin role enables platform-wide credential viewing", async () => {
  for (const roles of [["platform-admin"], ["issuer-admin"], ["issuer-operator"], ["verifier"], []]) {
    const credentials = [{ id: "credential-id", issuerId: "issuer-id", organizationId: "org-id" }];
    const { handler, calls } = loadHandler({ user: { issuerId: "issuer-id", organizationId: "org-id", roles }, credentials });
    const response = await handler.GET(new Request(
      "https://verifiable.sg/api/credentials?platformAdmin=true&issuerId=other-issuer&status=revoked&limit=25"
    ));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { credentials: credentials.map((record) => ({ ...record,
      canManage: roles.includes("platform-admin") || roles.includes("issuer-operator"),
    })) });
    assert.deepEqual(calls, [
      ...(["platform-admin", "issuer-operator"].some((role) => roles.includes(role)) ? [["expireOverdue", "issuer-id"]] : []),
      ["list", "issuer-id", { status: "revoked", limit: 25, platformAdmin: roles.includes("platform-admin"), organizationId: "org-id" }],
    ]);
  }
});

test("platform-wide listing defaults to no requested limit and reports failures", async () => {
  const { handler, calls } = loadHandler({
    user: { issuerId: "issuer-id", roles: ["platform-admin"] },
    failure: new Error("Database unavailable"),
  });
  const response = await handler.GET(new Request("https://verifiable.sg/api/credentials"));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Unable to load credentials." });
  assert.deepEqual(calls[1], ["list", "issuer-id", { status: undefined, limit: undefined, platformAdmin: true, organizationId: undefined }]);
});
