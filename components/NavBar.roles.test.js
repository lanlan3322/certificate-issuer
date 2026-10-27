const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

function find(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}

test("desktop and mobile Organization navigation is visible only to platform-admin", async () => {
  for (const roles of [null, ["issuer-operator"], ["issuer-admin"], ["platform-admin"]]) {
    const states = [];
    const effects = [];
    const listeners = {};
    let index = 0;
    const filename = `${__dirname}/NavBar.tsx`;
    const instance = new Module(filename, module);
    instance.paths = Module._nodeModulePaths(__dirname);
    const normalRequire = instance.require.bind(instance);
    const mockRequire = (name) => {
      if (name === "react") return {
        useState(initial) {
          const i = index++;
          if (!(i in states)) states[i] = initial;
          return [states[i], (value) => { states[i] = typeof value === "function" ? value(states[i]) : value; }];
        },
        useEffect(effect) { effects.push(effect); },
        useRef: () => ({ current: null }),
      };
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") return { usePathname: () => "/", useRouter: () => ({}) };
      if (name === "./PageLoadingIndicator") return { default: () => null };
      return normalRequire(name);
    };
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    let currentRoles = roles;
    new Function("require", "module", "exports", "fetch", "window", "document", code)(
      mockRequire, instance, instance.exports,
      async () => ({ ok: true, json: async () => ({ user: currentRoles ? { roles: currentRoles } : null }) }),
      { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} },
      { addEventListener() {}, removeEventListener() {}, documentElement: { classList: { contains: () => false } } }
    );
    const render = () => { index = 0; effects.length = 0; return instance.exports.default({}); };
    render();
    effects.splice(0).forEach((effect) => effect());
    await new Promise((resolve) => setImmediate(resolve));
    const buttons = find(render(), (node) => node.type === "button");
    const eServices = buttons.find((node) => find(node, (child) => child.type === "span" && child.props.children === "eServices").length);
    eServices.props.onClick();
    buttons.at(-1).props.onClick();
    assert.equal(find(render(), (node) => node.props?.href === "/platform").length,
      roles?.includes("platform-admin") ? 2 : 0);
    assert.equal(find(render(), (node) => node.props?.href === "/dashboard").length, roles ? 2 : 0);
    currentRoles = ["issuer-operator"];
    listeners["trustvc-auth-changed"]();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(find(render(), (node) => node.props?.href === "/platform").length, 0);
  }
});

test("both dashboard views put My Profile immediately before Issue certificate", () => {
  for (const relativePath of ["../app/dashboard/page.tsx", "../app/issuer/page.tsx"]) {
    const source = ts.createSourceFile(relativePath, readFileSync(`${__dirname}/${relativePath}`, "utf8"),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let found = false;
    const visit = (node) => {
      if (ts.isJsxElement(node)) {
        const links = node.children.filter(ts.isJsxElement).filter((child) =>
          child.openingElement.tagName.getText(source) === "Link");
        const profileIndex = links.findIndex((link) => link.children.some((child) =>
          ts.isJsxText(child) && child.text === "My Profile"));
        if (profileIndex >= 0) {
          assert.match(links[profileIndex].openingElement.getText(source), /href="\/profile\/"/);
          assert.match(links[profileIndex + 1].getText(source), /Issue certificate/);
          found = true;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.ok(found, `Missing profile link in ${relativePath}`);
  }
});
