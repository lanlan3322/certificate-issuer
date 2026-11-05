const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");

function setup() {
  let preferencesOpened = false;
  const javascript = ts.transpileModule(readFileSync(`${__dirname}/Footer.tsx`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", javascript)((name) => {
    if (name === "next/link") return { default: ({ prefetch, ...props }) => require("react").createElement("a", props) };
    if (name === "../lib/cookie-consent") return { openCookiePreferences() { preferencesOpened = true; } };
    assert.equal(name, "react/jsx-runtime");
    return require(name);
  }, module, module.exports, () => { assert.fail("Footer must not make any API calls."); });
  return { render: module.exports.default, preferencesOpened: () => preferencesOpened };
}

test("public footer groups platform, resources and legal links without session requests", () => {
  const footer = setup();
  const html = renderToStaticMarkup(footer.render());
  for (const label of ["Platform links", "Resources links", "Legal links", "User guide", "Admin guide", "Privacy policy", "Terms of service", "Cookie preferences"]) assert.ok(html.includes(label), label);
  assert.match(html, /Credential-as-a-Service/);
  assert.equal((html.match(/<nav\b/g) ?? []).length, 3);
});

test("footer preserves cookie preference controls", () => {
  const footer = setup();
  function find(node) {
    if (!node || typeof node !== "object") return undefined;
    if (Array.isArray(node)) return node.map(find).find(Boolean);
    return node.type === "button" ? node : find(node.props?.children);
  }
  find(footer.render()).props.onClick();
  assert.equal(footer.preferencesOpened(), true);
});
