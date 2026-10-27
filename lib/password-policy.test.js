const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { isValidPassword, PASSWORD_REQUIREMENTS } = require("./password-policy.ts");
const ts = require("typescript");

const invalidPasswords = [
  "Short1!", "lowercase123!", "UPPERCASE123!", "NoNumbersHere!",
  "NoSpecial123", "Whitespace123 ", "Abcdefg1!", "",
];

test("password policy requires ten characters and all four character classes", () => {
  for (const password of invalidPasswords) {
    assert.equal(isValidPassword(password), false);
  }
  for (const password of ["Abcdefgh1!", "ValidPass1!", "LongPassword2@", "Strong1234_"]) {
    assert.equal(isValidPassword(password), true);
  }
});

function loadAuth() {
  const filename = `${__dirname}/auth.ts`;
  const instance = new Module(filename, module);
  instance.filename = filename;
  const calls = [];
  instance.require = (name) => {
    if (name === "./password-policy") return { isValidPassword, PASSWORD_REQUIREMENTS };
    if (name === "./site") return { withBasePath: (url) => `/portal${url}` };
    if (name === "./supabase/session") return {};
    if (name === "./supabase/server") return {
      getSupabaseServerClient: async () => {
        calls.push("client");
        return { auth: {
          getUser: async () => ({ data: { user: { id: "user" } } }),
          updateUser: async (input) => { calls.push(input); return { error: null }; },
        } };
      },
      getSupabasePasswordResetClient: () => ({ auth: {
        resetPasswordForEmail: async (email, options) => {
          calls.push({ email, ...options });
          return { error: null };
        },
      } }),
    };
    throw new Error(`Unexpected dependency ${name}`);
  };
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { ...instance.exports, calls };
}

test("server rejects weak passwords before attempting any Supabase update", async () => {
  const auth = loadAuth();
  for (const password of invalidPasswords) {
    await assert.rejects(auth.resetPassword(password), auth.PasswordValidationError);
  }
  assert.deepEqual(auth.calls, []);
  await auth.resetPassword("ValidPass1!");
  assert.deepEqual(auth.calls, ["client", { password: "ValidPass1!" }]);
});

test("new reset emails target password setup and respect the configured base path", async () => {
  const auth = loadAuth();
  await auth.requestPasswordReset("User@example.com", "https://verifiable.sg");
  assert.deepEqual(auth.calls, [{
    email: "user@example.com",
    redirectTo: "https://verifiable.sg/portal/issuer/?mode=reset",
  }]);
});
