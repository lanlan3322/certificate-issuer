const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

test("page results render distinct open buttons and invoke the selected action", () => {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(`${__dirname}/AgentMessage.tsx`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)(require, module, module.exports);
  const selected = [];
  const node = module.exports.default({
    message: { role: "assistant", content: "Choose a page", actions: [
      { type: "navigate", href: "/billing", label: "Billing & usage" },
      { type: "navigate", href: "/docs/user-manual", label: "User guide" },
    ] },
    onAction: index => selected.push(index),
  });
  const html = renderToStaticMarkup(node);
  assert.match(html, /Open Billing &amp; usage/);
  assert.match(html, /Open User guide/);
  const bubble = node.props.children[1];
  bubble.props.children[1][1].props.onClick();
  assert.deepEqual(selected, [1]);
});
