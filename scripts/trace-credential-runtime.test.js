const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, copyFileSync, statSync, rmSync } = require("node:fs");
const path = require("node:path");
const { tmpdir } = require("node:os");
const { runtimeModules, traceCredentialRuntime } = require("./trace-credential-runtime");

test("tracing permits the optional BBS native package to be absent but rejects unknown missing dependencies", async () => {
  const source = require("node:fs").readFileSync(path.join(__dirname, "trace-credential-runtime.js"), "utf8");
  const run = (dependency) => {
    const module = { exports: {} };
    const mockRequire = (name) => {
      if (name === "next/dist/compiled/@vercel/nft") return {
        nodeFileTrace: async () => ({
          fileList: new Set(),
          warnings: new Set([new Error(`Failed to resolve dependency "${dependency}":\nCannot find module '${dependency}' loaded from /vercel/path0/node_modules/@mattrglobal/bbs-signatures/lib/index.js`)]),
        }),
      };
      return require(name);
    };
    mockRequire.resolve = require.resolve;
    new Function("require", "module", "exports", "__dirname", source)(mockRequire, module, module.exports, __dirname);
    return module.exports.traceCredentialRuntime();
  };
  await run("@mattrglobal/node-bbs-signatures");
  await run("/vercel/path0/node_modules/@mattrglobal/node-bbs-signatures/native/index.node");
  await assert.rejects(run("unexpected-required-module"), /unexpected-required-module/);
});

test("runtime tracing includes dynamic SDK entry points, not build tools or PDF assets", async () => {
  const files = await traceCredentialRuntime();
  for (const name of runtimeModules) {
    const entry = path.relative(process.cwd(), require.resolve(name)).replaceAll("\\", "/");
    assert.ok(files.includes(entry), `Missing runtime entry: ${name}`);
  }
  assert.ok(files.every((file) => !/node_modules\/(?:typescript|eslint|@next|@electric-sql|jspdf|html2canvas)\//.test(file)));
  const bytes = files.reduce((total, file) => total + statSync(file).size, 0);
  assert.ok(bytes < 25 * 1024 * 1024, `Runtime dependency trace grew to ${bytes} bytes`);
  const config = await require("../next.config.js")();
  for (const route of ["/api/issue", "/api/verify", "/api/status-list/*/*"]) {
    assert.deepEqual(config.outputFileTracingIncludes[route], files);
    assert.ok(config.outputFileTracingIncludes[route].every((file) => !file.includes("*")));
  }
});

test("isolated traced dependencies use BBS WASM without the optional native package and preserve signing and verification", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "credential-runtime-trace-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const files = await traceCredentialRuntime();
  for (const file of files) {
    if (file.replaceAll("\\", "/").includes("/@mattrglobal/node-bbs-signatures/")) continue;
    const destination = path.join(directory, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(file, destination);
  }
  const output = execFileSync(process.execPath, ["--no-experimental-require-module", "-e", `
    const assert = require('node:assert/strict');
    const { pathToFileURL } = require('node:url');
    global.fetch = () => { throw new Error('Unexpected network request'); };
    (async () => {
      assert.throws(() => require.resolve('@mattrglobal/node-bbs-signatures'), { code: 'MODULE_NOT_FOUND' });
      const bbs = require('@mattrglobal/bbs-signatures');
      const bbsKey = await bbs.generateBls12381G2KeyPair();
      assert.ok(bbsKey.publicKey.length);
      require('@trustvc/trustvc');
      const { getDocumentLoader } = require('@trustvc/w3c-context');
      const { signCredential, deriveCredential, verifyCredential } = require('@trustvc/w3c-vc');
      const { StatusList } = require('@trustvc/w3c-credential-status');
      const { generate } = await import(pathToFileURL(require.resolve('@digitalbazaar/ecdsa-multikey')));
      const controller = 'did:web:trace.example';
      const id = controller + '#key-1';
      const key = await generate({ curve: 'P-256', controller, id });
      const publicKey = await key.export({ publicKey: true });
      const keyPair = await key.export({ publicKey: true, secretKey: true });
      const loader = await getDocumentLoader({
        [id]: publicKey,
        [controller]: {
          '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
          id: controller, verificationMethod: [publicKey], assertionMethod: [id]
        }
      });
      const credential = {
        '@context': ['https://www.w3.org/ns/credentials/v2', { name: 'https://schema.org/name' }],
        type: ['VerifiableCredential'], issuer: controller,
        validFrom: '2026-01-01T00:00:00Z',
        credentialSubject: { id: 'urn:example:recipient', name: 'Trace Test' }
      };
      const result = await signCredential(credential, keyPair, 'ecdsa-sd-2023', { documentLoader: loader });
      assert.ok(result.signed, result.error);
      const disclosure = await deriveCredential(result.signed, ['/credentialSubject'], { documentLoader: loader });
      assert.ok(disclosure.derived, disclosure.error);
      const verified = await verifyCredential(disclosure.derived, { documentLoader: loader });
      assert.equal(verified.verified, true, verified.error);
      const tampered = JSON.parse(JSON.stringify(disclosure.derived));
      tampered.credentialSubject.name = 'Changed';
      assert.equal((await verifyCredential(tampered, { documentLoader: loader })).verified, false);
      const list = new StatusList({ buffer: Buffer.alloc(16384) });
      list.setStatus(12, true);
      assert.equal((await StatusList.decode({ encodedList: await list.encode() })).getStatus(12), true);
      console.log('Isolated SDK signing, verification, tampering and status checks passed');
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: directory, env: { ...process.env, NODE_PATH: "" }, encoding: "utf8", timeout: 60000 });
  assert.match(output, /Isolated SDK signing, verification, tampering and status checks passed/);
});
