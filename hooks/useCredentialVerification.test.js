const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

const javascript = ts.transpileModule(readFileSync(`${__dirname}/useCredentialVerification.ts`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(fetch) {
  let state;
  let effect;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", javascript)((name) => {
    if (name === "react") return {
      useState: () => [state, (value) => { state = typeof value === "function" ? value(state) : value; }],
      useEffect: (callback) => { effect = callback; },
    };
    if (name === "../lib/site") return { withBasePath: (url) => `/base${url}` };
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports, fetch);
  return {
    ...module.exports,
    start(rows) { module.exports.useCredentialVerification(rows); return effect(); },
    results: () => state,
  };
}

const credential = { proof: { verificationMethod: "did:web:academy.example#key" } };
const rows = ["a", "b", "c"].map((id) => ({ id, externalId: `external-${id}`, credential }));
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("columns distinguish verified evidence from failed, unavailable and non-DID checks", () => {
  const { verificationColumns } = setup();
  assert.deepEqual(verificationColumns({ details: {
    blockchainVerification: "passed", signatureVerification: "verified", issuerAuthorization: "verified",
  } }, credential), { blockchain: "Yes", did: "Yes", message: "Verification completed." });
  assert.equal(verificationColumns({ valid: true }, credential).did, "Not verified");
  assert.equal(verificationColumns({ valid: true }, credential).blockchain, "Unavailable");
  assert.equal(verificationColumns({ details: { signatureVerification: "verified" } }, credential).did, "Not verified");
  assert.equal(verificationColumns({ details: { blockchainVerification: "failed" } }, credential).blockchain, "No");
  assert.equal(verificationColumns({ details: { blockchainVerification: "not required" } }, {}).blockchain, "Not required");
  assert.equal(verificationColumns({}, { proof: { verificationMethod: "0xwallet" } }).did, "Not applicable");
  assert.equal(verificationColumns({ details: { blockchainVerification: "unavailable" } }, {}).blockchain, "Unavailable");
});

test("automatically verifies each exact credential sequentially using the existing endpoint", async () => {
  const requests = [];
  let active = 0;
  let maxActive = 0;
  const hook = setup(async (url, options) => {
    active++;
    maxActive = Math.max(active, maxActive);
    requests.push({ url, ...JSON.parse(options.body) });
    await tick();
    active--;
    return { ok: true, status: 200, json: async () => ({ valid: true, details: {
      blockchainVerification: "passed", signatureVerification: "verified", issuerAuthorization: "verified",
    } }) };
  });
  const stop = hook.start(rows);
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(maxActive, 1);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0], { url: "/base/api/verify", externalId: "external-a", credential });
  assert.equal(hook.results().c.blockchain, "Yes");
  assert.equal(hook.results().c.did, "Yes");
  stop();
});

test("rate limits stop further requests and explicitly mark every remaining row", async () => {
  let count = 0;
  const hook = setup(async () => {
    count++;
    return { ok: false, status: 429, json: async () => ({ error: "Try again later." }) };
  });
  hook.start(rows);
  await tick();
  assert.equal(count, 1);
  for (const row of rows) {
    assert.equal(hook.results()[row.id].did, "Rate limited");
    assert.equal(hook.results()[row.id].blockchain, "Rate limited");
    assert.equal(hook.results()[row.id].message, "Try again later.");
  }
});

test("request errors and malformed responses show unavailable, not verified success", async () => {
  let count = 0;
  const hook = setup(async () => {
    if (++count === 1) throw new Error("Network unavailable");
    return { ok: true, json: async () => ({}) };
  });
  hook.start(rows.slice(0, 2));
  await tick();
  assert.equal(hook.results().a.did, "Unavailable");
  assert.equal(hook.results().a.message, "Network unavailable");
  assert.equal(hook.results().b.blockchain, "Unavailable");
});

test("unmount cancels verification and prevents stale state updates", async () => {
  let finish;
  let signal;
  const hook = setup((_url, options) => {
    signal = options.signal;
    return new Promise((resolve) => { finish = resolve; });
  });
  const stop = hook.start(rows);
  stop();
  assert.equal(signal.aborted, true);
  finish({ ok: true, json: async () => ({ valid: true }) });
  await tick();
  assert.deepEqual(hook.results(), {});
});
