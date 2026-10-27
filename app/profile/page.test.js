const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

const profile = {
  id: "self", email: "me@example.com", displayName: "My Name", roles: ["issuer-operator"],
  issuerId: "issuer", issuerName: "Academy", organizationId: "org", organizationName: "Organization",
  createdAt: "created", updatedAt: "updated",
};
function setup({ loadError, saveError, resetError } = {}) {
  const state = [];
  let cursor = 0;
  const effects = [];
  const requests = [];
  const events = [];
  const filename = `${__dirname}/page.tsx`;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(__dirname);
  const normalRequire = instance.require.bind(instance);
  const mockRequire = (name) => {
    if (name === "react") return {
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      useEffect(effect) { effects.push(effect); },
    };
    if (name === "next/link") return { default: ({ children, href }) => require("react").createElement("a", { href }, children) };
    if (name === "../../lib/site") return { withBasePath: (url) => `/portal${url}` };
    return normalRequire(name);
  };
  const fetch = async (url, options) => {
    requests.push({ url, options });
    const error = url.endsWith("reset-request") ? resetError : options?.method === "PATCH" ? saveError : loadError;
    return { ok: !error, json: async () => error ? { error } :
      url.endsWith("reset-request") ? { message: "Reset instructions sent." } :
      options?.method === "PATCH" ? { displayName: JSON.parse(options.body).displayName.trim(), updatedAt: "new-time" } :
      { profile } };
  };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", "fetch", "window", code)(
    mockRequire, instance, instance.exports, fetch, { dispatchEvent: (event) => events.push(event.type) }
  );
  const render = () => {
    cursor = 0;
    effects.length = 0;
    return instance.exports.default();
  };
  return { render, requests, events, async mount() {
    render();
    effects.splice(0).forEach((effect) => effect());
    await new Promise((resolve) => setImmediate(resolve));
  } };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}

test("profile shows all account details with only display name editable", async () => {
  const app = setup();
  await app.mount();
  const page = app.render();
  const markup = renderToStaticMarkup(page);
  for (const value of ["me@example.com", "issuer-operator", "Academy", "Organization", "created", "updated"]) {
    assert.ok(markup.includes(value));
  }
  assert.equal(find(page, (node) => node.type === "input").length, 1);
  assert.equal(find(page, (node) => node.type === "input")[0].props.id, "display-name");
});

test("saving profile submits only displayName and refreshes authentication UI", async () => {
  const app = setup();
  await app.mount();
  find(app.render(), (node) => node.type === "input")[0].props.onChange({ target: { value: "Updated Name" } });
  await find(app.render(), (node) => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  const request = app.requests.at(-1);
  assert.equal(request.url, "/portal/api/auth/profile");
  assert.equal(request.options.method, "PATCH");
  assert.deepEqual(JSON.parse(request.options.body), { displayName: "Updated Name" });
  assert.deepEqual(app.events, ["trustvc-auth-changed"]);
  const markup = renderToStaticMarkup(app.render());
  assert.match(markup, /Profile updated/);
  assert.match(markup, /new-time/);
});

test("reset password sends instructions only to the loaded account email", async () => {
  const app = setup();
  await app.mount();
  find(app.render(), (node) => node.type === "button" && node.props.children === "Reset password")[0].props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  const request = app.requests.at(-1);
  assert.equal(request.url, "/portal/api/auth/reset-request");
  assert.deepEqual(JSON.parse(request.options.body), { email: profile.email });
  assert.match(renderToStaticMarkup(app.render()), /Reset instructions sent/);
});

test("profile loading and mutation failures are visible without success messages", async () => {
  const failed = setup({ loadError: "Login required." });
  await failed.mount();
  assert.match(renderToStaticMarkup(failed.render()), /Login required/);
  assert.equal(find(failed.render(), (node) => node.type === "form").length, 0);
  const app = setup({ saveError: "Save failed.", resetError: "Email delivery failed." });
  await app.mount();
  await find(app.render(), (node) => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.match(renderToStaticMarkup(app.render()), /Save failed/);
  assert.doesNotMatch(renderToStaticMarkup(app.render()), /Profile updated/);
  find(app.render(), (node) => node.type === "button" && node.props.children === "Reset password")[0].props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(renderToStaticMarkup(app.render()), /Email delivery failed/);
});
