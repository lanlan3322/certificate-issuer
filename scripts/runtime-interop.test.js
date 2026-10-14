const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

test("deployment pins the supported Node major", () => {
  const manifest = require("../package.json");
  const lock = require("../package-lock.json");
  assert.equal(manifest.engines.node, "24.x");
  assert.equal(lock.packages[""].engines.node, manifest.engines.node);
});

test("patched SDKs load and generate an ECDSA key with require(ESM) disabled", () => {
  const output = execFileSync(process.execPath, [
    "--no-experimental-require-module", "-e",
    `(async () => {
      require('@trustvc/w3c-context');
      require('@trustvc/w3c-vc');
      require('@trustvc/w3c-credential-status');
      const path = require('node:path');
      const root = path.dirname(require.resolve('@trustvc/w3c-issuer'));
      const { generateEcdsaSd2023KeyPair } = require(path.join(root, 'did-web/keyPair/ecdsaSd2023.js'));
      const key = await generateEcdsaSd2023KeyPair();
      if (!key.publicKeyMultibase || !key.secretKeyMultibase) throw new Error('Key generation failed');
      console.log('dynamic imports verified');
    })().catch(error => { console.error(error); process.exit(1); });`,
  ], { encoding: "utf8", timeout: 30000 });
  assert.match(output, /dynamic imports verified/);
});

test("TrustVC CommonJS entry points load their ESM dependencies without ERR_REQUIRE_ESM", () => {
  const context = require("@trustvc/w3c-context");
  const credentials = require("@trustvc/w3c-vc");
  const status = require("@trustvc/w3c-credential-status");
  assert.equal(typeof context.getDocumentLoader, "function");
  assert.equal(typeof credentials.verifyCredential, "function");
  assert.equal(typeof status.StatusList, "function");
});
