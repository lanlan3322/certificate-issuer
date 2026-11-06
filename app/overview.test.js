const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");
function renderOverview() {
  function load(filename) {
    const mod = { exports: {} };
    const javascript = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function("require", "module", "exports", javascript)(name => {
      if (name === "next/link") return { default: ({ prefetch, ...props }) => require("react").createElement("a", props) };
      if (name === "../components/MarketingPage") return load(`${__dirname}/../components/MarketingPage.tsx`);
      if (name === "../lib/marketing") return require("../lib/marketing.ts");
      return require(name);
    }, mod, mod.exports);
    return mod.exports;
  }
  return renderToStaticMarkup(load(`${__dirname}/page.tsx`).default());
}

test("overview prioritizes actionable navigation before standards and FAQ", () => {
  const html = renderOverview();
  for (const href of ["/contact#demo", "/contact#consultation", "/verify", "/pricing", "/platform/organization-management"]) {
    assert.ok(html.includes(`href="${href}"`), `Preserve ${href} navigation`);
  }
  assert.ok(html.indexOf("contact#demo") < html.indexOf("standards-heading"));
  assert.ok(html.indexOf("standards-heading") < html.indexOf("faq-heading"));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
});

test("overview fills both hero columns and uses responsive action cards", () => {
  const html = renderOverview();
  assert.match(html, /lg:grid-cols-\[1\.4fr_1fr\]/);
  assert.match(html, /<aside aria-labelledby="trust-heading"/);
  assert.match(html, /<ol/);
  assert.match(html, /grid gap-4 md:grid-cols-3/);
  assert.match(html, /md:grid-cols-2 xl:grid-cols-3/);
  assert.match(html, /min-h-11/);
  assert.match(readFileSync(`${__dirname}/globals.css`, "utf8"), /:focus-visible/);
});
