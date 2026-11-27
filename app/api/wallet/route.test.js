const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const rows = [
  { id: first, recipient_email: "holder@example.com", credential: '{"id":"one"}', external_id: "one", recipient_name: "Holder", status: "issued", issued_at: "2026-01-01", issuer_snapshot: {} },
  { id: second, recipient_email: "other@example.com", credential: { id: "two" }, external_id: "two", recipient_name: "Other", status: "issued", issued_at: "2026-01-01", issuer_snapshot: {} },
];

function harness(initialUser = { id: "holder", email: "holder@example.com", email_confirmed_at: "2026-01-01" }) {
  let user = initialUser;
  const audits = [];
  let auditError = null;
  class Query {
    constructor(table) { this.table = table; this.filters = []; }
    select() { return this; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    order() { return this; }
    filtered() {
      return rows.filter((row) => this.filters.every(([key, value]) =>
        key === "recipient_email" ? row[key].toLowerCase() === value.toLowerCase() : row[key] === value));
    }
    async range(start, end) { return { data: this.filtered().slice(start, end + 1), error: null }; }
    async maybeSingle() { return { data: this.table === "credentials" ? this.filtered()[0] ?? null : null, error: null }; }
    async insert(value) {
      if (this.table === "wallet_audit_events") {
        if (auditError) return { error: auditError };
        audits.push(value);
      }
      return { error: null };
    }
  }
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table) => new Query(table),
  };
  const mocks = {
    "next/server": { NextResponse },
    "../../../lib/supabase/server": {
      getSupabaseServerClient: async () => client,
      getSupabaseAdmin: () => ({ from: (table) => new Query(table) }),
    },
    "../../../lib/stored-credential": { parseStoredCredential: (value) => typeof value === "string" ? JSON.parse(value) : value },
    "../../../lib/wallet": { walletRecord: (row) => ({ id: row.id, externalId: row.external_id }) },
  };
  const filename = path.join(__dirname, "route.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(__dirname);
  instance.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { ...instance.exports, audits, setUser: (next) => { user = next; }, failAudit: () => { auditError = new Error("audit unavailable"); } };
}

const request = (path = "", options) => new Request(`https://verifiable.sg/api/wallet${path}`, options);
const post = (body, origin = "https://verifiable.sg") => request("", {
  method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
});

test("verified email limits lists and details, including after an email change", async () => {
  const wallet = harness();
  const list = await wallet.GET(request());
  assert.equal(list.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await list.json()).credentials, [{ id: first, externalId: "one" }]);
  assert.equal((await wallet.GET(request(`?credential=${second}`))).status, 404);
  const detail = await wallet.GET(request(`?credential=${first}`));
  assert.deepEqual((await detail.json()).document, { id: "one" });
  assert.equal(wallet.audits[0].action, "credential.viewed");
  wallet.setUser({ id: "holder", email: "other@example.com", email_confirmed_at: "2026-02-01" });
  assert.equal((await wallet.GET(request(`?credential=${first}`))).status, 404);
  assert.equal((await wallet.GET(request(`?credential=${second}`))).status, 200);
});

test("missing and unconfirmed sessions cannot access wallet data", async () => {
  for (const user of [null, { id: "holder", email: "holder@example.com" }]) {
    const wallet = harness(user);
    assert.equal((await wallet.GET(request())).status, 401);
    assert.equal((await wallet.POST(post({ id: first, action: "credential.shared" }))).status, 401);
    assert.equal(wallet.audits.length, 0);
  }
});

test("wallet actions check ownership, origin and audit persistence", async () => {
  const wallet = harness();
  assert.equal((await wallet.POST(post({ id: second, action: "credential.shared" }))).status, 404);
  assert.equal((await wallet.POST(post({ id: first, action: "credential.shared" }, "https://evil.example"))).status, 403);
  assert.equal((await wallet.POST(post({ id: first, action: "credential.revoked" }))).status, 400);
  assert.equal((await wallet.POST(post({ id: first, action: "credential.downloaded" }))).status, 200);
  assert.equal(wallet.audits[0].auth_user_id, "holder");
  assert.equal(wallet.audits[0].credential_id, first);
  wallet.failAudit();
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal((await wallet.GET(request(`?credential=${first}`))).status, 500);
  } finally { console.error = original; }
});
