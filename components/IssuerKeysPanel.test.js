const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

const source = readFileSync(`${__dirname}/IssuerKeysPanel.tsx`, "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const key = {
  id: "key-1", issuerId: "issuer/a", publicKey: "PUBLIC-DO-NOT-RENDER",
  fingerprint: "sha256:fingerprint", algorithm: "P-256", keyVersion: 1,
  status: "pending", createdAt: "2026-11-06T00:00:00Z", rotatedAt: null, downloadAvailable: true,
};

function setup({ canManage = true, keys = [key], confirm = true, get, rotate, download, clickFails = false } = {}) {
  const states = [], refs = [], effects = [], requests = [], confirmations = [], events = [];
  let cursor = 0, effectStarted = false;
  const module = { exports: {} };
  const react = {
    useCallback: (callback) => callback,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return refs[index] ??= { current: initial };
    },
    useEffect(effect) {
      if (!effectStarted) { effectStarted = true; effects.push(effect); }
    },
  };
  const anchor = {
    click() { events.push("click"); if (clickFails) throw new Error("Save blocked"); },
    remove() { events.push("remove"); },
  };
  new Function("require", "module", "exports", "fetch", "window", "URL", "document", javascript)(
    (name) => {
      if (name === "react") return react;
      if (name === "../lib/site") return { withBasePath: (path) => `/portal${path}` };
      return require(name);
    }, module, module.exports,
    async (url, options) => {
      requests.push({ url, options });
      if (options.method === "POST") {
        if (url.endsWith("/download")) {
          if (download) return download();
          return {
            ok: true, headers: new Headers({ "content-type": "application/zip" }),
            blob: async () => new Blob(["opaque zip bytes"]),
          };
        }
        return rotate ? rotate() : Response.json({ generated: true });
      }
      return get ? get() : Response.json({ canManage, keys });
    },
    { confirm(message) { confirmations.push(message); return confirm; } },
    {
      createObjectURL(blob) { assert.ok(blob instanceof Blob); events.push("create"); return "blob:export"; },
      revokeObjectURL(url) { assert.equal(url, "blob:export"); events.push("revoke"); },
    },
    { createElement: () => anchor, body: { appendChild() { events.push("append"); } } },
  );
  const app = {
    requests, confirmations, events, states,
    render() { cursor = 0; return module.exports.default({ issuerId: "issuer/a" }); },
    html() { return renderToStaticMarkup(app.render()); },
    async mount() {
      app.render(); effects.splice(0).forEach((effect) => effect());
      await new Promise(setImmediate);
    },
    async click(label) {
      button(app.render(), label).props.onClick();
      await new Promise(setImmediate);
    },
  };
  return app;
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}
function button(tree, label) {
  const found = find(tree, (node) => node.type === "button" && node.props.children === label);
  assert.ok(found, `Missing ${label}`);
  return found;
}

test("mount reads only metadata without generating or prefetching an export", async () => {
  const app = setup();
  await app.mount();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].url, "/portal/api/issuers/issuer%2Fa/keys");
  assert.equal(app.requests[0].options.credentials, "same-origin");
  assert.equal(app.requests[0].options.cache, "no-store");
  assert.equal(app.requests[0].options.method, undefined);
  for (const label of ["Fingerprint", "P-256", "Version", "pending", "Created", "Rotated"]) assert.ok(app.html().includes(label));
  assert.doesNotMatch(app.html(), /PUBLIC-DO-NOT-RENDER/);
  assert.ok(!JSON.stringify(app.states).includes("PUBLIC-DO-NOT-RENDER"));
  assert.equal(button(app.render(), "Download Key Pair").props.disabled, false);
});

test("non-manager sees fingerprints only, with no administrative metadata or actions", async () => {
  const app = setup({ canManage: false });
  await app.mount();
  assert.match(app.html(), /sha256:fingerprint/);
  assert.doesNotMatch(app.html(), /P-256|Version|pending|Created|Rotated|Rotate Key|Download Key Pair|2026/);
});

test("empty lists do not generate keys and unavailable downloads stay disabled", async () => {
  for (const keys of [[], [{ ...key, downloadAvailable: false }]]) {
    const app = setup({ keys });
    await app.mount();
    assert.equal(button(app.render(), "Download Key Pair").props.disabled, true);
    await app.click("Download Key Pair");
    assert.equal(app.requests.length, 1);
  }
});

test("cancelling either confirmation makes no mutation request", async () => {
  const app = setup({ confirm: false });
  await app.mount();
  await app.click("Rotate Key");
  await app.click("Download Key Pair");
  assert.equal(app.requests.length, 1);
  assert.match(app.confirmations[0], /pending only.*will not activate/);
  assert.match(app.confirmations[1], /private PEM.*only once.*10 minutes.*version 1.*lost response cannot be retried/);
});

test("rotation creates only a pending next version, prevents duplicate submission and refreshes metadata", async () => {
  const app = setup();
  await app.mount();
  const rotate = button(app.render(), "Rotate Key");
  rotate.props.onClick(); rotate.props.onClick();
  await new Promise(setImmediate);
  assert.equal(app.requests.length, 3);
  assert.deepEqual(JSON.parse(app.requests[1].options.body), { action: "rotate" });
  assert.equal(app.requests[1].options.credentials, "same-origin");
  assert.match(app.html(), /Next key version created as pending/);
  assert.equal(app.confirmations.length, 1);
});

test("ZIP is fetched explicitly, saved with a blob URL and immediately revoked without rendering contents", async () => {
  const app = setup();
  await app.mount();
  const download = button(app.render(), "Download Key Pair");
  download.props.onClick(); download.props.onClick();
  await new Promise(setImmediate);
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[1].url, "/portal/api/issuers/issuer%2Fa/keys/download");
  assert.equal(app.requests[1].options.method, "POST");
  assert.equal(app.requests[1].options.credentials, "same-origin");
  assert.equal(app.requests[1].options.cache, "no-store");
  assert.deepEqual(app.events, ["create", "append", "click", "remove", "revoke"]);
  assert.equal(button(app.render(), "Download Key Pair").props.disabled, true);
  assert.doesNotMatch(app.html(), /opaque zip bytes|blob:export/);
  assert.ok(!JSON.stringify(app.states).includes("opaque zip bytes"));
  await app.click("Download Key Pair");
  assert.equal(app.requests.length, 2);
});

test("managed activation is explicit, manager-only and preserves public history copy",async()=>{
  const app=setup();await app.mount();await app.click("Activate pending key");
  assert.deepEqual(JSON.parse(app.requests[1].options.body),{action:"activate",keyId:"key-1"});
  assert.equal(app.requests[1].options.method,"POST");
  assert.match(app.html(),/Historical methods are retained/);
  const member=setup({canManage:false});await member.mount();
  assert.doesNotMatch(member.html(),/Activate pending key/);
});

test("failed, lost or non-ZIP downloads show errors and cannot be retried", async () => {
  for (const download of [
    () => Response.json({ error: "Export expired" }, { status: 410 }),
    () => Response.json({ error: "Export unavailable" }),
    () => { throw new Error("Connection lost"); },
  ]) {
    const app = setup({ download });
    await app.mount();
    await app.click("Download Key Pair");
    assert.match(app.html(), /role="alert"/);
    assert.match(app.html(), /lost response cannot be retried/);
    assert.equal(button(app.render(), "Download Key Pair").props.disabled, true);
    assert.deepEqual(app.events, []);
    await app.click("Download Key Pair");
    assert.equal(app.requests.length, 2);
  }
});

test("object URLs are revoked even when browser save fails", async () => {
  const app = setup({ clickFails: true });
  await app.mount();
  await app.click("Download Key Pair");
  assert.deepEqual(app.events, ["create", "append", "click", "remove", "revoke"]);
  assert.match(app.html(), /Save blocked/);
});

test("key reads and rotations report server and transport failures clearly", async () => {
  for (const get of [
    () => Response.json({ error: "Access denied" }, { status: 403 }),
    () => { throw new Error("Network unavailable"); },
    () => Response.json({ unexpected: true }),
  ]) {
    const app = setup({ get });
    await app.mount();
    assert.match(app.html(), /role="alert"/);
    assert.doesNotMatch(app.html(), /Rotate Key|Download Key Pair/);
  }
  const app = setup({ rotate: () => Response.json({ error: "Rotation denied" }, { status: 403 }) });
  await app.mount();
  await app.click("Rotate Key");
  assert.match(app.html(), /Rotation denied/);
  assert.equal(button(app.render(), "Rotate Key").props.disabled, false);
});

test("admin details mount keys scoped to selection and successful creation selects the new issuer", () => {
  const admin = readFileSync(`${__dirname}/../app/admin/page.tsx`, "utf8");
  assert.match(admin, /<IssuerKeysPanel key=\{selectedIssuer.id\} issuerId=\{selectedIssuer.id\} \/>/);
  assert.match(admin, /const saved = payload.issuer;[\s\S]*?setSelectedIssuerId\(saved.id\)/);
});
