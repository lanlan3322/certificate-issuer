const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const policy = require("../../lib/password-policy.ts");

function load(relativePath, mocks, globals = {}) {
  const filename = path.resolve(__dirname, relativePath);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = instance.require.bind(instance);
  const requireMock = (name) => Object.hasOwn(mocks, name) ? mocks[name] : normalRequire(name);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    requireMock, instance, instance.exports, ...Object.values(globals)
  );
  return instance.exports;
}

test("email recovery landing on the overview is forwarded to password setup without dropping tokens", () => {
  for (const type of ["recovery", "invite"]) {
    const destinations = [];
    const hash = `#type=${type}&access_token=test&refresh_token=refresh`;
    const component = load("../../components/AuthEmailRedirect.tsx", {
      react: { useEffect: (effect) => effect() },
      "../lib/site": { withBasePath: (url) => `/portal${url}` },
    }, { window: { location: { pathname: "/portal/", hash, replace: (url) => destinations.push(url) } } });
    component.default();
    assert.deepEqual(destinations, [`/portal/issuer/?mode=reset${hash}`]);
  }
});

test("ordinary overview visits and issuer landing do not redirect or loop", () => {
  for (const [pathname, hash] of [
    ["/", ""], ["/", "#tab=overview"], ["/issuer/", "#type=recovery"],
  ]) {
    const component = load("../../components/AuthEmailRedirect.tsx", {
      react: { useEffect: (effect) => effect() },
      "../lib/site": { withBasePath: (url) => url },
    }, { window: { location: { pathname, hash, replace: () => assert.fail("Unexpected redirect") } } });
    component.default();
  }
});

test("overview query-string token hashes are forwarded for verification before password setup", () => {
  for (const origin of ["https://www.verifiable.sg", "https://verifiable.sg"]) {
    for (const basePath of ["", "/portal"]) {
      for (const type of ["recovery", "invite"]) {
        const token = "test-recovery-token";
        const landing = new URL(`${origin}${basePath}/?token_hash=${token}&type=${type}&next=https://other.example`);
        const destinations = [];
        const component = load("../../components/AuthEmailRedirect.tsx", {
          react: { useEffect: (effect) => effect() },
          "../lib/site": { withBasePath: (url) => `${basePath}${url}` },
        }, { window: { location: {
          pathname: landing.pathname, search: landing.search, hash: "",
          replace: (url) => destinations.push(new URL(url, origin).href),
        } } });
        component.default();
        assert.deepEqual(destinations, [
          `${origin}${basePath}/auth/recovery/?token_hash=${token}&type=${type}`,
        ]);
      }
    }
  }
});

test("query token compatibility handles issuer landing and token alias without redirect loops", () => {
  for (const [pathname, search, expected] of [
    ["/issuer/", "?token=example&type=recovery", "/auth/recovery/?token_hash=example&type=recovery"],
    ["/auth/recovery/", "?token_hash=example&type=recovery", null],
    ["/", "?token_hash=example&type=signup", null],
    ["/", "?type=recovery", null],
  ]) {
    const destinations = [];
    const component = load("../../components/AuthEmailRedirect.tsx", {
      react: { useEffect: (effect) => effect() },
      "../lib/site": { withBasePath: (url) => url },
    }, { window: { location: {
      pathname, search, hash: "", replace: (url) => destinations.push(url),
    } } });
    component.default();
    assert.deepEqual(destinations, expected ? [expected] : []);
  }
});

test("expired query-string recovery tokens return a visible invalid-link destination", async () => {
  const route = load("../auth/recovery/route.ts", {
    "../../../lib/site": { withBasePath: (url) => url },
    "../../../lib/supabase/server": {
      getSupabaseServerClient: async () => ({ auth: {
        verifyOtp: async () => ({ data: { session: null, user: null }, error: { message: "Expired" } }),
      } }),
    },
  });
  const response = await route.GET(new Request("https://www.verifiable.sg/auth/recovery/?token_hash=expired-test&type=recovery"));
  assert.equal(response.headers.get("location"), "https://www.verifiable.sg/issuer/?error=invalid_link");
});

test("token-hash links keep verifyOtp while default confirmation links reach the browser reset handler", async () => {
  const calls = [];
  const route = load("../auth/recovery/route.ts", {
    "../../../lib/site": { withBasePath: (url) => url },
    "../../../lib/supabase/server": {
      getSupabaseServerClient: async () => ({ auth: {
        verifyOtp: async (input) => { calls.push(input); return { data: { session: {}, user: { id: "u" } }, error: null }; },
      } }),
    },
  });
  const defaultLink = await route.GET(new Request("https://verifiable.sg/auth/recovery"));
  assert.equal(defaultLink.headers.get("location"), "https://verifiable.sg/issuer/?mode=reset");
  assert.equal(calls.length, 0);
  const tokenHash = await route.GET(new Request("https://verifiable.sg/auth/recovery?token_hash=test&type=recovery"));
  assert.deepEqual(calls, [{ token_hash: "test", type: "recovery" }]);
  assert.equal(tokenHash.headers.get("location"), "https://verifiable.sg/issuer/?mode=reset");
});

function renderPortal(mode, recoverySession) {
  let index = 0;
  const state = [mode, "", "", recoverySession, "", {
    displayName: "Issuer User", issuerName: "Academy", email: "issuer@example.com",
  }, [], null, null, false];
  const component = load("page.tsx", {
    react: { useState: () => [state[index++], () => {}], useEffect: () => {} },
    "next/link": { default: () => null },
    "next/navigation": { useRouter: () => ({}) },
    "lucide-react": { KeyRound: () => null, LogOut: () => null, ShieldCheck: () => null },
    "../../lib/site": { withBasePath: (url) => url },
    "../../lib/safe-internal-path": {},
    "../../lib/supabase/client": {},
    "../../lib/password-policy": policy,
    "../templates/registry": { TEMPLATE_OPTIONS: [] },
  });
  return renderToStaticMarkup(component.default());
}

test("signed-in recovery users see password setup rather than the issuer overview", () => {
  const reset = renderPortal("reset", true);
  assert.match(reset, /Set new password/);
  assert.match(reset, /special character/);
  assert.doesNotMatch(reset, /Welcome, Issuer User/);
  const normal = renderPortal("login", false);
  assert.match(normal, /Welcome, /);
  assert.doesNotMatch(normal, /Set new password/);
});

test("password form enforces the shared policy before sending the reset request", async () => {
  const source = ts.createSourceFile("page.tsx", readFileSync(`${__dirname}/page.tsx`, "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "submitReset") {
      handler = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(handler);
  for (const [password, valid] of [["MissingSpecial123", false], ["Abcdefg1!", false], ["Abcdefgh1!", true]]) {
    const calls = [];
    const errors = [];
    const javascript = ts.transpileModule(`const run = ${handler.getText(source)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mocks = {
      newPassword: password,
      ...policy,
      setLoading: () => {},
      setError: (message) => errors.push(message),
      setMessage: () => {},
      setMode: () => {},
      setNewPassword: () => {},
      setRecoverySession: () => {},
      withBasePath: (url) => url,
      fetch: async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ reset: true }) };
      },
    };
    const run = new Function(...Object.keys(mocks), `${javascript}\nreturn run;`)(...Object.values(mocks));
    await run({ preventDefault() {} });
    assert.equal(calls.length, valid ? 1 : 0);
    if (!valid) assert.equal(errors.at(-1), policy.PASSWORD_REQUIREMENTS);
    else assert.deepEqual(calls[0], { url: "/api/auth/reset", body: { password } });
  }
});
