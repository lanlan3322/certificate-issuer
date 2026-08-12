const test = require("node:test");
const assert = require("node:assert/strict");

const { createApiRouteSpec, authorizeApiRequest } = require("./phase8");

test("phase 8 exposes a versioned API contract and validates enterprise access", () => {
  const spec = createApiRouteSpec({
    name: "issue",
    method: "POST",
    path: "/api/v1/credentials/issue",
    scopes: ["issuer:write"],
  });

  assert.equal(spec.name, "issue");
  assert.equal(spec.version, "v1");
  assert.deepEqual(spec.scopes, ["issuer:write"]);

  const allowed = authorizeApiRequest({
    route: spec,
    tokenScopes: ["issuer:write", "issuer:read"],
  });

  assert.equal(allowed, true);

  const denied = authorizeApiRequest({
    route: spec,
    tokenScopes: ["issuer:read"],
  });

  assert.equal(denied, false);
});
