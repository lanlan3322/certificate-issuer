const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

function setup(initialUser) {
  let user = initialUser, cursor = 0;
  const states = [], tracks = [];
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(`${__dirname}/AgentWidget.tsx`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const dependencies = {
    react: {
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useRef(initial) { return { current: initial }; },
      useEffect() {},
      useCallback(callback) { return callback; },
    },
    "next/navigation": { usePathname: () => "/release-notes", useRouter: () => ({ push() {} }) },
    "../WorkspaceSession": { useWorkspaceSession: () => ({ user }) },
    "./AgentWindow": { default: () => null },
    "../../lib/agent/analytics": { AgentAnalyticsService: { track: (...args) => tracks.push(args) } },
    "../../lib/agent/local": { createLocalAgentResponse() {} },
    "../../lib/site": { withBasePath: url => url },
  };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), module, module.exports);
  return {
    render() { cursor = 0; return module.exports.default(); },
    setUser(value) { user = value; },
    tracks,
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(child => find(child, predicate));
  return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}

test("floating assistant opens and closes for signed-in users and disappears on sign-out", () => {
  const app = setup(null);
  assert.equal(app.render(), null);
  app.setUser({ roles: ["viewer"] });
  let page = app.render();
  const launcher = find(page, node => node.props?.["aria-label"] === "Open Issuer Success Agent")[0];
  assert.match(launcher.props.className, /fixed bottom-4 right-4/);
  launcher.props.onClick();
  assert.deepEqual(app.tracks, [["widget-toggle", "/release-notes"]]);
  page = app.render();
  assert.equal(find(page, node => node.props?.["aria-label"] === "Open Issuer Success Agent").length, 0);
  const window = find(page, node => typeof node.props?.onClose === "function")[0];
  assert.ok(window);
  window.props.onClose();
  assert.equal(find(app.render(), node => node.props?.["aria-label"] === "Open Issuer Success Agent").length, 1);
  app.setUser(null);
  assert.equal(app.render(), null);
});
