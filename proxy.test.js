const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load() {
  const filename = path.resolve(__dirname, "proxy.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => name === "@supabase/ssr"
    ? { createServerClient: () => { throw new Error("Unexpected auth lookup."); } }
    : name === "next/server" ? { NextResponse: response }
    : normalRequire(name);
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true },
  }).outputText, filename);
  return instance.exports;
}

function makeResponse(kind, destination) {
  return { kind, destination, headers: new Headers() };
}
const response = {
  next: () => makeResponse("next"),
  rewrite: (url) => makeResponse("rewrite", url),
  redirect: (url) => makeResponse("redirect", url),
  json: (body, options) => ({ ...makeResponse("json"), body, ...options }),
};

test("DID:web profile host is rewritten while the legacy static DID stays untouched", async () => {
  const { proxy } = load();
  const request = (host, pathname = "/.well-known/did.json") => ({
    nextUrl: { host, pathname, search: "" },
    url: `https://${host}${pathname}`,
    headers: new Headers({ host }),
  });

  const legacy = await proxy(request("verifiable.sg"));
  assert.equal(legacy.kind, "next");

  const profile = await proxy(request("fta.verifiable.sg"));
  assert.equal(profile.kind, "rewrite");
  assert.equal(profile.destination.pathname, "/api/.well-known/did");
  assert.equal(profile.headers.get("access-control-allow-origin"), "*");

  const api = await proxy(request("fta.verifiable.sg", "/api/.well-known/did"));
  assert.equal(api.kind, "next");
  assert.equal(api.headers.get("access-control-allow-origin"), "*");
});
