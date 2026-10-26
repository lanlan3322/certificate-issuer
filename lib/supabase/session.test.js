const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const staleError = Object.assign(new Error("Invalid Refresh Token: Refresh Token Not Found"), {
  name: "AuthApiError",
  status: 400,
  code: "refresh_token_not_found",
});

test("anonymous visitor without cookies resolves as logged out", async () => {
  const { getUserSafely } = await import("./session.ts");
  const result = await getUserSafely({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } });
  assert.deepEqual(result, { user: null, staleSession: false });
});

test("refresh_token_not_found returned by getUser is treated as logged out", async () => {
  const { getUserSafely } = await import("./session.ts");
  const result = await getUserSafely({ auth: { getUser: async () => ({ data: { user: null }, error: staleError }) } });
  assert.deepEqual(result, { user: null, staleSession: true });
});

test("refresh_token_not_found thrown by getUser does not throw", async () => {
  const { getUserSafely } = await import("./session.ts");
  const result = await getUserSafely({ auth: { getUser: async () => { throw staleError; } } });
  assert.deepEqual(result, { user: null, staleSession: true });
});

test("valid session still returns the user (login unaffected)", async () => {
  const { getUserSafely } = await import("./session.ts");
  const user = { id: "auth-user-1" };
  const result = await getUserSafely({ auth: { getUser: async () => ({ data: { user }, error: null }) } });
  assert.deepEqual(result, { user, staleSession: false });
});

test("other auth failures are logged out but not flagged as stale cookies", async () => {
  const { getUserSafely, isStaleSessionError } = await import("./session.ts");
  const networkError = Object.assign(new Error("fetch failed"), { status: 0 });
  assert.equal(isStaleSessionError(networkError), false);
  const result = await getUserSafely({ auth: { getUser: async () => { throw networkError; } } });
  assert.deepEqual(result, { user: null, staleSession: false });
});

test("only Supabase auth-token cookies are cleared", async () => {
  const { isSupabaseAuthCookie } = await import("./session.ts");
  assert.equal(isSupabaseAuthCookie("sb-abcd-auth-token"), true);
  assert.equal(isSupabaseAuthCookie("sb-abcd-auth-token.0"), true);
  assert.equal(isSupabaseAuthCookie("sb-abcd-auth-token-code-verifier"), false);
  assert.equal(isSupabaseAuthCookie("theme"), false);
});

test("proxy and root-layout auth lookup use the safe session helper", () => {
  const root = path.join(__dirname, "..", "..");
  const proxy = readFileSync(path.join(root, "proxy.ts"), "utf8");
  const auth = readFileSync(path.join(root, "lib", "auth.ts"), "utf8");
  assert.match(proxy, /getUserSafely\(supabase\)/);
  assert.doesNotMatch(proxy, /supabase\.auth\.getUser\(\)/);
  const currentUser = auth.slice(auth.indexOf("export async function getCurrentIssuerUser"));
  assert.match(currentUser.slice(0, 300), /getUserSafely\(supabase\)/);
});
