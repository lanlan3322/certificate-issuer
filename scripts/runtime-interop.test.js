const test = require("node:test");
const assert = require("node:assert/strict");

test("deployment pins the supported Node major with native require(ESM) enabled", () => {
  const manifest = require("../package.json");
  const lock = require("../package-lock.json");
  assert.equal(manifest.engines.node, "24.x");
  assert.equal(lock.packages[""].engines.node, manifest.engines.node);
  assert.equal(process.features.require_module, true,
    "TrustVC requires native require(ESM); do not disable it with NODE_OPTIONS.");
});

test("TrustVC CommonJS entry points load their ESM dependencies without ERR_REQUIRE_ESM", () => {
  const context = require("@trustvc/w3c-context");
  const credentials = require("@trustvc/w3c-vc");
  const status = require("@trustvc/w3c-credential-status");
  assert.equal(typeof context.getDocumentLoader, "function");
  assert.equal(typeof credentials.verifyCredential, "function");
  assert.equal(typeof status.StatusList, "function");
});
