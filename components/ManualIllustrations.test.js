const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const source = readFileSync(path.resolve(__dirname, "..", file), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", javascript)((name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    assert.ok(["react", "react/jsx-runtime"].includes(name), `Unexpected dependency: ${name}`);
    return require(name);
  }, module, module.exports);
  return module.exports;
}

const illustrations = load("components/ManualIllustrations.tsx");
function renderManual(name) {
  const Page = load(`app/docs/${name}-manual/page.tsx`, {
    "next/link": { default: "a" },
    "../../../components/ManualIllustrations": illustrations,
  }).default;
  return renderToStaticMarkup(React.createElement(Page));
}

test("both manuals render numbered visual flows, accessible tables and working section anchors", () => {
  for (const name of ["user", "admin"]) {
    const html = renderManual(name);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.match(html, /<figure/);
    assert.match(html, /<figcaption/);
    assert.match(html, /<ol class="grid/);
    assert.match(html, /<caption/);
    assert.match(html, /scope="col"/);
    assert.match(html, /scope="row"/);
    assert.match(html, /<details/);
    assert.match(html, /dark:bg-slate-900/);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(target), target);
    for (const [, heading] of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(heading), heading);
  }
});

test("user quick reference preserves search, sort, Send and verification limitations", () => {
  const html = renderManual("user");
  for (const phrase of [
    "illustration", "ascending", "descending", "Cancel sends nothing",
    "Accepted is not delivered", "recorded recipient", "does not run automatic verification",
    "unavailable results are not verification success", "shared identity",
  ]) assert.ok(html.includes(phrase), phrase);
  assert.doesNotMatch(html, /<input|<button/);
});

test("admin keeps operational cautions and sign-off status visible outside collapsed details", () => {
  const html = renderManual("admin");
  const overview = html.replace(/<details\b[\s\S]*?<\/details>/g, "");
  for (const phrase of [
    "not certification", "within 30 days", "three calendar days after that determination",
    "attestation recorded, overall approval pending", "Operator identity: not confirmed",
    "RESEND_API_KEY", "EMAIL_FROM", "20 attempts per user per 15 minutes",
  ]) assert.ok(overview.includes(phrase), phrase);
  assert.match(html, /without undue delay/);
  assert.match(html, /Significant scale alone does not automatically require individual notification/);
});
