const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relative, mocks = {}, window) {
  const module = { exports: {} };
  const source = readFileSync(path.resolve(__dirname, relative), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", "window", code)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "next/link") return { default: "a" };
    assert.ok(["react", "react/jsx-runtime"].includes(name), `Unexpected dependency: ${name}`);
    return require(name);
  }, module, module.exports, window);
  return module.exports;
}

test("public legal pages have metadata, semantic sections, contacts and related links", () => {
  const LegalPage = load("LegalPage.tsx").default;
  for (const route of ["privacy", "terms", "contact"]) {
    const page = load(`../../app/${route}/page.tsx`, { "../../components/legal/LegalPage": { default: LegalPage } });
    assert.ok(page.metadata.title);
    assert.ok(page.metadata.description);
    const html = renderToStaticMarkup(React.createElement(page.default));
    assert.match(html, /<main/);
    assert.match(html, /<h1/);
    assert.match(html, /On this page/);
    assert.match(html, /mailto:support@verifiable\.sg/);
    assert.doesNotMatch(html, /(?:dpo|privacy|contact)@verifiable\.sg/);
    for (const href of ["/privacy", "/terms", "/contact"]) assert.ok(html.includes(`href="${href}"`));
  }
});

test("account-creation and login notices contain clickable legal links without a checkbox", () => {
  const Notice = load("LegalNotice.tsx").default;
  for (const accountCreation of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(Notice, { accountCreation }));
    assert.match(html, /href="\/terms"/);
    assert.match(html, /href="\/privacy"/);
    assert.equal(html.includes("By creating an account"), accountCreation);
    assert.equal(html.includes("do not constitute blanket consent"), accountCreation);
    assert.doesNotMatch(html, /checkbox/);
  }
  const issuer = readFileSync(path.resolve(__dirname, "../../app/issuer/page.tsx"), "utf8");
  assert.match(issuer, /<LegalNotice accountCreation=\{recoverySession\}/);
});

test("PDPA policy distinguishes retention, withdrawal, access, and conditional rights", () => {
  const LegalPage = load("LegalPage.tsx").default;
  const Page = load("../../app/privacy/page.tsx", {
    "../../components/legal/LegalPage": { default: LegalPage },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Page));
  for (const phrase of [
    "original purpose is no longer served",
    "retention is no longer necessary for legal or business purposes",
    "reasonable notice",
    "unless otherwise required or authorised by law",
    "does not provide an unconditional general right to erasure",
    "year preceding your request",
    "notify you in writing within that period",
    "does not impose a blanket opt-in rule for every cookie",
    "Provider names alone do not demonstrate compliance",
    "An issuer&#x27;s responsibilities do not remove our own obligations",
    "not blanket consent to unrelated processing",
  ]) assert.ok(html.includes(phrase), `Missing PDPA clarification: ${phrase}`);
});

test("admin PDPA handoff documents timelines without claiming operational completion", () => {
  const manual = readFileSync(path.resolve(__dirname, "../../app/docs/admin-manual/page.tsx"), "utf8");
  for (const phrase of [
    "not confirmation that staffing",
    "appoint a DPO",
    "within 30 days",
    "three calendar days after that determination",
    "Significant scale alone does not automatically require individual notification",
    "without undue delay",
    "Test deletion/anonymisation procedures",
    "Keep evidence",
  ]) assert.ok(manual.includes(phrase), `Missing operational instruction: ${phrase}`);
});

test("PDPA attestation remains distinct from verified evidence and overall sign-off", () => {
  const manual = readFileSync(path.resolve(__dirname, "../../app/docs/admin-manual/page.tsx"), "utf8");
  for (const phrase of [
    "attestation recorded, overall approval pending",
    "28 October 2026 (Singapore time)",
    "No supporting details or evidence were supplied",
    "Operator identity: not confirmed",
    "DPO and contact: operator-attested, evidence pending",
    "Provider and transfer safeguards: operator-attested, evidence pending",
    "Retention controls: operator-attested, evidence pending",
    "Request and incident procedures: operator-attested, evidence pending",
    "not an authenticated approval workflow",
    "access-controlled compliance repository",
  ]) assert.ok(manual.includes(phrase), `Missing attestation limitation: ${phrase}`);
});

function banner(initialConsent = null, pathname = "/") {
  const states = [];
  let index = 0;
  const effects = [];
  let consent = initialConsent;
  let blocked = false;
  const window = new EventTarget();
  const api = {
    COOKIE_CONSENT_CHANGED: "changed", COOKIE_CONSENT_KEY: "consent", COOKIE_PREFERENCES_OPEN: "open",
    readCookieConsent: () => consent,
    saveCookieConsent: (analytics) => {
      if (blocked) throw new Error("blocked");
      consent = { necessary: true, analytics, marketing: false, version: 1, consentDate: new Date().toISOString() };
      return consent;
    },
  };
  const Banner = load("CookieBanner.tsx", {
    react: {
      useState(value) {
        const key = index++;
        if (!(key in states)) states[key] = value;
        return [states[key], (value) => { states[key] = value; }];
      },
      useEffect(callback) { effects.push(callback); },
    },
    "next/navigation": { usePathname: () => pathname },
    "../../lib/cookie-consent": api,
    "./CookiePreferencesModal": { default: (props) => React.createElement("aside", props) },
  }, window).default;
  const render = () => { index = 0; effects.length = 0; return Banner(); };
  render();
  const cleanup = effects[0]();
  return {
    render, window, cleanup, block: () => { blocked = true; }, consent: () => consent,
    externalConsent(value) {
      consent = value;
      window.dispatchEvent(Object.assign(new Event("storage"), { key: api.COOKIE_CONSENT_KEY }));
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

test("banner is first-visit only, accepts and rejects, and preferences reopen", () => {
  for (const [label, expected] of [["Accept All", true], ["Reject Optional", false]]) {
    const ui = banner();
    assert.ok(find(ui.render(), (node) => node.props?.["aria-label"] === "Cookie consent"));
    find(ui.render(), (node) => node.type === "button" && node.props.children === label).props.onClick();
    assert.equal(ui.consent().analytics, expected);
    assert.equal(find(ui.render(), (node) => node.props?.["aria-label"] === "Cookie consent"), undefined);
    ui.window.dispatchEvent(new Event("open"));
    const modal = find(ui.render(), (node) => node.props?.onSave);
    assert.equal(modal.props.analytics, expected);
    modal.props.onSave(!expected);
    assert.equal(ui.consent().analytics, !expected);
    ui.cleanup();
  }
  const returning = banner({ analytics: false });
  assert.equal(find(returning.render(), (node) => node.props?.["aria-label"] === "Cookie consent"), undefined);
  returning.cleanup();
});

test("storage failure is explicit and embedded renderer gets no overlay", () => {
  const ui = banner();
  ui.block();
  find(ui.render(), (node) => node.type === "button" && node.props.children === "Accept All").props.onClick();
  assert.ok(find(ui.render(), (node) => node.props?.role === "alert"));
  assert.equal(ui.consent(), null);
  ui.cleanup();
  const embedded = banner(null, "/renderer/");
  assert.equal(embedded.render(), null);
  embedded.cleanup();
});

test("cross-tab changes refresh the banner and listeners are removed on unmount", () => {
  const ui = banner();
  ui.externalConsent({ analytics: false });
  assert.equal(find(ui.render(), (node) => node.props?.["aria-label"] === "Cookie consent"), undefined);
  ui.externalConsent(null);
  assert.ok(find(ui.render(), (node) => node.props?.["aria-label"] === "Cookie consent"));
  ui.cleanup();
  ui.externalConsent({ analytics: true });
  assert.ok(find(ui.render(), (node) => node.props?.["aria-label"] === "Cookie consent"));
});

test("preferences are keyboard-dismissable, close on privacy navigation, and do not save on close", () => {
  let closed = 0;
  let saved = 0;
  const Modal = load("CookiePreferencesModal.tsx", { react: {
    useRef: () => ({ current: null }),
    useEffect() {},
    useState: (value) => [value, () => {}],
  } }).default;
  const element = Modal({ analytics: false, error: null, onClose: () => closed++, onSave: () => saved++ });
  let prevented = false;
  element.props.onKeyDown({ key: "Escape", preventDefault() { prevented = true; } });
  assert.equal(closed, 1);
  assert.equal(prevented, true);
  find(element, (node) => node.props?.href === "/privacy").props.onClick();
  assert.equal(closed, 2);
  assert.equal(saved, 0);
  const html = renderToStaticMarkup(element);
  assert.match(html, /aria-modal="true"/);
  const necessary = find(element, (node) => node.type === "input" && node.props.disabled);
  assert.equal(necessary.props.checked, true);
});

test("email templates carry legal links and preserve Supabase action placeholders", () => {
  for (const name of ["supabase-invitation.html", "supabase-registration.html", "supabase-reset.html", "legal-footer.html", "legal-footer.txt"]) {
    const template = readFileSync(path.resolve(__dirname, "../../emails", name), "utf8");
    assert.match(template, /This email was sent by Verifiable.sg/);
    assert.match(template, /https:\/\/verifiable.sg\/privacy/);
    assert.match(template, /https:\/\/verifiable.sg\/terms/);
    if (name.startsWith("supabase")) assert.match(template, /\{\{ .ConfirmationURL \}\}/);
  }
});
