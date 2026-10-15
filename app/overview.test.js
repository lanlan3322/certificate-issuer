const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");
const icons = require("lucide-react");

function renderOverview() {
  const source = ts.createSourceFile("page.tsx", readFileSync(`${__dirname}/page.tsx`, "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = source.statements.find((node) => ts.isFunctionDeclaration(node) &&
    node.name?.text === "HomePage");
  const returned = page.body.statements.find(ts.isReturnStatement);
  const javascript = ts.transpileModule(`const render = () => (${returned.expression.getText(source)});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const names = ["Shield", "ArrowRight", "FileText", "ShieldCheck", "CheckCircle"];
  const render = new Function("require", "exports", ...names, `${javascript}\nreturn render;`)(
    require, {}, ...names.map((name) => icons[name])
  );
  return renderToStaticMarkup(render());
}

test("overview prioritizes actionable navigation before standards and FAQ", () => {
  const html = renderOverview();
  for (const href of ["/insurance", "/verify", "/enterprise"]) {
    assert.ok(html.includes(`href="${href}"`), `Preserve ${href} navigation`);
  }
  assert.ok(html.indexOf("quick-actions-heading") < html.indexOf("standards-heading"));
  assert.ok(html.indexOf("standards-heading") < html.indexOf("faq-heading"));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
});

test("overview fills both hero columns and uses responsive action cards", () => {
  const html = renderOverview();
  assert.match(html, /lg:grid-cols-\[1\.2fr_0\.8fr\]/);
  assert.match(html, /<aside aria-labelledby="workflow-heading"/);
  assert.match(html, /<ol/);
  assert.match(html, /grid gap-4 md:grid-cols-3/);
  assert.equal((html.match(/group flex flex-col rounded-2xl/g) ?? []).length, 3);
  assert.match(html, /focus-visible:outline-cyan-600/);
});
