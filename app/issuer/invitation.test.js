const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const source = ts.createSourceFile("page.tsx", readFileSync(`${__dirname}/page.tsx`, "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let initializer;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "acceptInvitation") {
    initializer = node.initializer;
  }
  ts.forEachChild(node, visit);
}
visit(source);

function setup(hash, failure = null, search = "?mode=reset") {
  const calls = [];
  const state = {};
  const script = ts.transpileModule(`const run = ${initializer.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const accept = new Function("window", "getSupabaseBrowserClient", "setMode", "setRecoverySession",
    `${script}\nreturn run;`)({
    location: { hash, pathname: "/issuer/", search },
    history: { replaceState: (...args) => calls.push(["replace", ...args]) },
  }, () => ({ auth: {
    getUser: async () => ({ data: { user: failure ? null : { id: "user" } }, error: failure }),
    setSession: async (tokens) => {
    calls.push(["session", tokens]);
    return { error: failure };
  } } }), (mode) => { state.mode = mode; }, (value) => { state.recovery = value; });
  return { accept, calls, state };
}

test("default Supabase invite link establishes cookie session and strips URL tokens", async () => {
  const { accept, calls, state } = setup("#type=invite&access_token=test-access&refresh_token=test-refresh");
  await accept();
  assert.deepEqual(calls[0], ["replace", null, "", "/issuer/?mode=reset"]);
  assert.deepEqual(calls[1], ["session", { access_token: "test-access", refresh_token: "test-refresh" }]);
  assert.equal(state.mode, "reset");
  assert.equal(state.recovery, true);
});

test("invalid invitation sessions fail explicitly and do not enter password setup", async () => {
  const app = setup("#type=invite&access_token=test-access&refresh_token=test-refresh", new Error("expired"));
  await assert.rejects(app.accept(), /invalid or expired/);
  assert.equal(app.state.recovery, undefined);
  await assert.rejects(setup("#type=invite").accept(), /incomplete/);
});

test("ordinary login and server-verified token-hash links do not consume fragment sessions", async () => {
  const app = setup("");
  await app.accept();
  assert.deepEqual(app.calls, []);
  assert.equal(app.state.recovery, true);
  const login = setup("", null, "");
  await login.accept();
  assert.equal(login.state.recovery, undefined);
});

test("recovery fragments establish the reset session just like invitation fragments", async () => {
  const app = setup("#type=recovery&access_token=test-access&refresh_token=test-refresh");
  await app.accept();
  assert.equal(app.state.mode, "reset");
  assert.equal(app.state.recovery, true);
  assert.equal(app.calls[0][0], "replace");
});

test("invalid recovery fragments and expired cookie sessions cannot enable password setup", async () => {
  const invalid = setup("#type=recovery&access_token=a&refresh_token=b", new Error("expired"));
  await assert.rejects(invalid.accept(), /reset link is invalid or expired/);
  assert.equal(invalid.state.recovery, undefined);
  const expired = setup("", new Error("expired"));
  await assert.rejects(expired.accept(), /reset link is invalid or has expired/);
  assert.equal(expired.state.recovery, undefined);
  await assert.rejects(setup("#type=recovery").accept(), /reset link is incomplete/);
});
