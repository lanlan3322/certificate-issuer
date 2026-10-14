const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } = require("node:fs");
const path = require("node:path");
const { tmpdir } = require("node:os");

test("sequential VC patches apply to clean, old-patch-cached and fully patched packages", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "trustvc-patch-regression-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = path.resolve(__dirname, "..");
  const packagePath = "node_modules/@trustvc/w3c-vc";
  cpSync(path.join(root, packagePath), path.join(directory, packagePath), { recursive: true });
  mkdirSync(path.join(directory, "patches"));
  const names = ["@trustvc+w3c-vc+2.4.2+001+namespace-interop.patch",
    "@trustvc+w3c-vc+2.4.2+002+dynamic-imports.patch"];
  for (const name of names) cpSync(path.join(root, "patches", name), path.join(directory, "patches", name));
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({
    private: true, dependencies: { "@trustvc/w3c-vc": "2.4.2" },
  }));
  const apply = () => execFileSync(process.execPath,
    [path.join(root, "node_modules/patch-package/index.js"), "--error-on-fail"],
    { cwd: directory, encoding: "utf8", timeout: 30000 });
  const reverse = (name) => {
    execFileSync("git", ["apply", "--reverse", path.join(directory, "patches", name)],
      { cwd: directory, encoding: "utf8" });
    rmSync(path.join(directory, packagePath, ".patch-package.json"), { force: true });
  };
  assert.match(apply(), /2 dynamic-imports.*✔/);
  reverse(names[1]);
  assert.match(apply(), /2 dynamic-imports.*✔/, "old namespace patch cache must be supported");
  reverse(names[1]);
  reverse(names[0]);
  assert.match(apply(), /2 dynamic-imports.*✔/, "clean package must be supported");
  for (const file of ["dist/lib/w3c-vc.js", "dist/lib/types.js", "dist/lib/presentation/index.js"]) {
    assert.equal(readFileSync(path.join(directory, packagePath, file), "utf8"),
      readFileSync(path.join(root, packagePath, file), "utf8"));
  }
});

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
