const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");

function callback(exchangeError) {
  const filename = path.join(__dirname, "route.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(__dirname);
  const mocks = {
    "next/server": { NextResponse },
    "../../../lib/supabase/server": { getSupabaseServerClient: async () => ({ auth: {
      exchangeCodeForSession: async () => ({ data: { session: null, user: null }, error: exchangeError }),
    } }) },
    "../../../lib/safe-internal-path": require("../../../lib/safe-internal-path.ts"),
    "../../../lib/site": { withBasePath: (value) => value },
  };
  instance.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return instance.exports.GET;
}

test("holder email callbacks return to the wallet and failures return to holder sign-in", async () => {
  const request = (query) => new Request(`https://verifiable.sg/auth/callback/?${query}`);
  const next = encodeURIComponent("/wallet/dashboard/");
  assert.equal((await callback(null)(request(`code=abc&next=${next}`))).headers.get("location"), "https://verifiable.sg/wallet/dashboard/");
  assert.equal((await callback({ message: "expired" })(request(`code=abc&next=${next}`))).headers.get("location"), "https://verifiable.sg/wallet/access/?error=invalid_link");
  assert.equal((await callback(null)(request(`next=${next}`))).headers.get("location"), "https://verifiable.sg/wallet/access/?error=missing_code");
  assert.equal((await callback({ message: "expired" })(request("code=abc"))).headers.get("location"), "https://verifiable.sg/issuer/?error=invalid_link");
});
