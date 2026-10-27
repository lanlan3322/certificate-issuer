const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");

test("Overview renders the same public content without session, wallet, or credential lookups", () => {
  const source = readFileSync(`${__dirname}/page.tsx`, "utf8");
  assert.doesNotMatch(source, /["']use client["']/);
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const outputs = [];
  for (const user of [null, { displayName: "Signed-in issuer", roles: ["issuer-operator"] }]) {
    const module = { exports: {} };
    const authCalls = [];
    new Function("require", "module", "exports", "fetch", javascript)(
      (name) => {
        assert.ok(["lucide-react", "react/jsx-runtime"].includes(name), `Unexpected overview dependency: ${name}`);
        return require(name);
      },
      module, module.exports,
      async (...args) => { authCalls.push(args); return { json: async () => ({ user }) }; }
    );
    const html = renderToStaticMarkup(module.exports.default());
    assert.match(html, /Trusted credentials/);
    assert.match(html, /One connected workflow/);
    assert.match(html, /Built on open standards/);
    assert.match(html, /Common questions/);
    assert.match(html, /href="\/insurance"/);
    assert.match(html, /href="\/verify"/);
    assert.doesNotMatch(html, /Welcome,|Issued certificates|My Profile/);
    assert.deepEqual(authCalls, []);
    outputs.push(html);
  }
  assert.equal(outputs[0], outputs[1]);
});
