const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

function load(filename, window, dependencies = {}, fetch) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(`${__dirname}/${filename}`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("module", "exports", "window", "require", "fetch", code)(
    module, module.exports, window, (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    }, fetch);
  return module.exports;
}

function browser() {
  const values = new Map();
  const window = new EventTarget();
  window.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  return window;
}

test("consent defaults to off, accepts, rejects, and survives a reload with versioned timestamps", () => {
  const window = browser();
  const consent = load("cookie-consent.ts", window);
  assert.equal(consent.readCookieConsent(), null);
  assert.equal(consent.hasAnalyticsConsent(), false);
  let changes = 0;
  window.addEventListener(consent.COOKIE_CONSENT_CHANGED, () => changes++);
  const accepted = consent.saveCookieConsent(true);
  assert.equal(accepted.necessary, true);
  assert.equal(accepted.marketing, false);
  assert.equal(accepted.version, 1);
  assert.ok(Number.isFinite(Date.parse(accepted.consentDate)));
  assert.equal(consent.hasAnalyticsConsent(), true);
  assert.deepEqual(load("cookie-consent.ts", window).readCookieConsent(), accepted);
  consent.saveCookieConsent(false);
  assert.equal(consent.hasAnalyticsConsent(), false);
  assert.equal(changes, 2);
});

test("missing, malformed, incompatible and inaccessible storage never grants analytics", () => {
  const consent = load("cookie-consent.ts", browser());
  for (const value of [
    null, "", "{", "null", "[]",
    JSON.stringify({ necessary: true, analytics: true, consentDate: "bad", version: 1, marketing: false }),
    JSON.stringify({ necessary: false, analytics: true, consentDate: new Date().toISOString(), version: 1, marketing: false }),
    JSON.stringify({ necessary: true, analytics: "true", consentDate: new Date().toISOString(), version: 1, marketing: false }),
    JSON.stringify({ necessary: true, analytics: true, consentDate: new Date().toISOString(), version: 2, marketing: false }),
    JSON.stringify({ necessary: true, analytics: true, consentDate: new Date().toISOString(), version: 1, marketing: true }),
  ]) assert.equal(consent.parseCookieConsent(value), null);
  const window = browser();
  window.localStorage.getItem = () => { throw new Error("blocked"); };
  window.localStorage.setItem = () => { throw new Error("blocked"); };
  const blocked = load("cookie-consent.ts", window);
  assert.equal(blocked.readCookieConsent(), null);
  assert.equal(blocked.hasAnalyticsConsent(), false);
  assert.throws(() => blocked.saveCookieConsent(true), /blocked/);
  assert.equal(load("cookie-consent.ts", undefined).hasAnalyticsConsent(), false);
});

test("footer preference event can be observed independently of login", () => {
  const window = browser();
  const consent = load("cookie-consent.ts", window);
  let opened = false;
  window.addEventListener(consent.COOKIE_PREFERENCES_OPEN, () => { opened = true; });
  consent.openCookiePreferences();
  assert.equal(opened, true);
});

test("existing optional analytics emits nothing before consent or after withdrawal", () => {
  const window = browser();
  const consent = load("cookie-consent.ts", window);
  const requests = [];
  const { AgentAnalyticsService } = load("agent/analytics.ts", window, {
    "../site": { withBasePath: (url) => url },
    "../cookie-consent": consent,
  }, (...args) => { requests.push(args); return Promise.resolve({ ok: true }); });
  AgentAnalyticsService.track("question", "/issuer");
  assert.equal(requests.length, 0);
  consent.saveCookieConsent(false);
  AgentAnalyticsService.track("question", "/issuer");
  assert.equal(requests.length, 0);
  consent.saveCookieConsent(true);
  AgentAnalyticsService.track("question", "/issuer");
  assert.equal(requests.length, 1);
  consent.saveCookieConsent(false);
  AgentAnalyticsService.track("question", "/issuer");
  assert.equal(requests.length, 1);
});
