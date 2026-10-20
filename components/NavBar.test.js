const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

test("Agent is always visible before the theme switch and opens the agent or issuer access", () => {
  const filename = path.join(__dirname, "NavBar.tsx");
  const javascript = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  for (const pathname of ["/insurance", "/insurance/", "/verify"]) {
    for (const agentAvailable of [true, false]) {
    let agentClick;
    const routes = [];
    const events = [];
    const previousWindow = global.window;
    global.window = { dispatchEvent: (event) => events.push(event.type) };
    const dependencies = {
      react: { ...React, useEffect() {} , useState: React.useState },
      "react/jsx-runtime": {
        ...require("react/jsx-runtime"),
        jsx: (type, props, key) => {
          if (props?.["aria-label"] === "Open Issuer Success Agent") agentClick = props.onClick;
          return require("react/jsx-runtime").jsx(type, props, key);
        },
      },
      "next/link": ({ href, onNavigate, children, ...props }) => {
        return React.createElement("a", { href, ...props }, children);
      },
      "next/navigation": { usePathname: () => pathname, useRouter: () => ({ push: (href) => routes.push(href) }) },
      "./PageLoadingIndicator": () => null,
    };
    const module = { exports: {} };
    new Function("require", "module", "exports", javascript)(
      (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
      module, module.exports
    );
    try {
      const html = renderToStaticMarkup(React.createElement(module.exports.default, { agentAvailable }));
      assert.match(html, /aria-label="Open Issuer Success Agent"[^>]*>Agent<\/button><button[^>]*aria-label="Switch to dark mode"/);
      assert.match(html, /<div class="flex items-center gap-2"><button type="button" aria-label="Open Issuer Success Agent"/);
      assert.equal(html.includes("Insurance Agent"), false);
      agentClick();
      assert.deepEqual(events, agentAvailable ? ["trustvc-agent-open"] : []);
      assert.deepEqual(routes, agentAvailable ? [] : ["/issuer/"]);
    } finally {
      if (previousWindow === undefined) delete global.window;
      else global.window = previousWindow;
    }
    }
  }
});

test("agent opens from the navigation event and no longer renders a floating launcher", () => {
  const filename = path.join(__dirname, "agent/AgentWidget.tsx");
  const source = readFileSync(filename, "utf8");
  assert.match(source, /addEventListener\("trustvc-agent-open", openAgent\)/);
  assert.match(source, /removeEventListener\("trustvc-agent-open", openAgent\)/);
  assert.match(source, /const openAgent = \(\) => \{\s*setOpen\(true\)/);
  assert.equal(source.includes("<button"), false);
  assert.match(source, /onClose=\{\(\) => setOpen\(false\)\}/);
});
