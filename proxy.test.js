const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load({ authenticated } = {}) {
  const filename = path.resolve(__dirname, "proxy.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = instance.require.bind(instance);
  instance.require = (name) => name === "@supabase/ssr"
    ? { createServerClient: () => {
      if (authenticated === undefined) throw new Error("Unexpected auth lookup.");
      return {};
    } }
    : name === "next/server" ? { NextResponse: response }
    : name === "./lib/supabase/session" ? {
      getUserSafely: async () => ({ user: authenticated ? { id: "user-id" } : null, staleSession: false }),
      isSupabaseAuthCookie: () => false,
    }
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

test("Overview stays public while Dashboard requires login", async () => {
  for (const authenticated of [false, true]) {
    const { proxy } = load({ authenticated });
    const request = (pathname) => ({
      nextUrl: { pathname, search: "" },
      url: `https://verifiable.sg${pathname}`,
      cookies: { getAll: () => [] },
    });

    assert.equal((await proxy(request("/"))).kind, "next");
    const dashboard = await proxy(request("/dashboard/"));
    assert.equal(dashboard.kind, authenticated ? "next" : "redirect");
    if (!authenticated) {
      assert.equal(dashboard.destination.pathname, "/issuer/");
      assert.equal(dashboard.destination.searchParams.get("next"), "/dashboard/");
    }
  }
});

test("managed organization DID and status paths are public, host-independent and bypass session lookups",async()=>{
  const {proxy}=load();
  for(const [path,target] of [
    ["/organizations/academy/did.json","/api/public/managed-did"],
    ["/organizations/academy/status-list/0/revocation","/api/public/managed-status"],
    ["/organizations/academy/status-list/1/suspension/","/api/public/managed-status"],
    ["/organizations/academy/self-managed/status-list/0/revocation","/api/public/managed-status"],
    ["/organizations/academy/self-managed/status-list/1/suspension/","/api/public/managed-status"],
  ]) {
    const result=await proxy({nextUrl:{pathname:path,search:"?slug=attacker"},url:`https://evil.example${path}?slug=attacker`,
      headers:new Headers({"x-forwarded-host":"foreign.example"})});
    assert.equal(result.kind,"rewrite");assert.equal(result.destination.pathname,target);
    assert.equal(result.destination.searchParams.get("slug"),"academy");
    assert.equal(result.headers.get("access-control-allow-origin"),"*");
    if(path.includes("status-list"))assert.ok(result.destination.searchParams.has("purpose"));
    assert.equal(result.destination.searchParams.get("hosting"),path.includes("/self-managed/")?"self-managed":null);
  }
  for(const path of ["/api/public/managed-did","/api/public/managed-status"]) {
    assert.equal((await proxy({nextUrl:{pathname:path},url:`https://verifiable.sg${path}`})).kind,"next");
  }
  const protectedProxy=load({authenticated:false}).proxy;
  for(const path of ["/organizations/academy/private/","/organization-did/"]) {
    const result=await protectedProxy({nextUrl:{pathname:path,search:""},url:`https://verifiable.sg${path}`,
      cookies:{getAll:()=>[]}});
    assert.equal(result.kind,"redirect");
  }
});

test("API calls avoid trailing-slash redirect requests while retaining authentication", async () => {
  for (const authenticated of [false, true]) {
    const { proxy } = load({ authenticated });
    for (const pathname of ["/api/auth/me", "/api/verify", "/api/templates", "/api/credentials","/api/self-managed-dids"]) {
      const request = {
        nextUrl: { pathname, search: "" }, url: `https://verifiable.sg${pathname}`,
        cookies: { getAll: () => [] },
      };
      const result = await proxy(request);
      const protectedApi = ["/api/templates", "/api/credentials","/api/self-managed-dids"].includes(pathname);
      assert.equal(result.kind, protectedApi && !authenticated ? "json" : "next");
      if (protectedApi && !authenticated) assert.equal(result.status, 401);
    }
  }
});
