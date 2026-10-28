const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");

const javascript = ts.transpileModule(readFileSync(`${__dirname}/Footer.tsx`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function setup(initial = false) {
  let visible;
  let effect;
  let user = initial ? { id: "user" } : null;
  let failed = false;
  const listeners = {};
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", "window", javascript)((name) => {
    if (name === "react") return {
      useState(value) { visible ??= value; return [visible, (value) => { visible = value; }]; },
      useEffect(callback) { effect = callback; },
    };
    if (name === "next/link") return { default: "a" };
    if (name === "next/navigation") return { usePathname: () => "/" };
    if (name === "../lib/site") return { withBasePath: (url) => `/base${url}` };
    if (name === "../lib/cookie-consent") return { openCookiePreferences() {} };
    assert.equal(name, "react/jsx-runtime");
    return require(name);
  }, module, module.exports, async (url, options) => {
    assert.equal(url, "/base/api/auth/me");
    assert.equal(options.cache, "no-store");
    return { ok: !failed, json: async () => ({ user }) };
  }, {
    addEventListener(name, callback) { listeners[name] = callback; },
    removeEventListener(name) { delete listeners[name]; },
  });
  const render = () => module.exports.default({ authenticated: initial });
  render();
  const cleanup = effect();
  return {
    html: () => renderToStaticMarkup(render()),
    changeUser(value) { user = value; },
    fail() { failed = true; },
    refresh: () => listeners["trustvc-auth-changed"](),
    cleanup,
    listeners,
  };
}

test("Documentation footer is hidden anonymously and appears after successful login", async () => {
  const footer = setup();
  assert.doesNotMatch(footer.html(), /Documentation/);
  assert.match(footer.html(), /Privacy Policy/);
  await footer.refresh();
  assert.doesNotMatch(footer.html(), /Documentation/);
  footer.changeUser({ id: "signed-in-user" });
  await footer.refresh();
  const html = footer.html();
  assert.match(html, /Documentation/);
  assert.match(html, /User Manual/);
  assert.match(html, /Admin Manual/);
  assert.match(html, /Release Notes/);
  footer.changeUser(null);
  await footer.refresh();
  assert.doesNotMatch(footer.html(), /Documentation/);
  assert.match(footer.html(), /Cookie Preferences/);
  footer.cleanup();
  assert.equal(footer.listeners["trustvc-auth-changed"], undefined);
});

test("server-authenticated footer renders initially and hides if authentication cannot be confirmed", async () => {
  const footer = setup(true);
  assert.match(footer.html(), /Documentation/);
  footer.fail();
  await footer.refresh();
  assert.doesNotMatch(footer.html(), /Documentation/);
  assert.match(footer.html(), /Privacy Policy/);
  footer.cleanup();
});
