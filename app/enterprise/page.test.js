const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function render() {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(`${__dirname}/page.tsx`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (name === "next/link") return { default: "a" };
    if (name === "lucide-react") return require(name);
    assert.equal(name, "react/jsx-runtime");
    return require(name);
  }, module, module.exports);
  return { html: renderToStaticMarkup(React.createElement(module.exports.default)), metadata: module.exports.metadata };
}

test("pricing page displays exact plan allowances, charges and reset terms", () => {
  const { html } = render();
  const cards = html.split('aria-labelledby="services-heading"')[0].split('<h3 class="text-lg font-semibold">').slice(1);
  assert.equal(cards.length, 3);
  const expected = [
    ["Starter", "SGD 29", "/ Month", "1 Issuer", "3 Certificate Templates", "50 Certificates Per Month", "resets each month", "Managed DID", "Basic Reporting", "Standard Support", "Start Free Consultation", "Membership organizations"],
    ["Professional", "SGD 199", "/ Month", "Unlimited Issuers", "Unlimited Certificate Templates", "1,000 Certificates Per Month", "accumulate throughout the subscription year", "resets upon annual renewal", "Managed DID", "Advanced Reporting", "Priority Support", "Book a Demo", "Corporate learning departments"],
    ["Enterprise Flex", "SGD 299", "One-Time Onboarding", "1 Certificate Template", "1 Issuer", "10 Certificates", "Organization Setup", "Platform Configuration", "Contact Sales"],
  ];
  cards.forEach((card, index) => {
    for (const text of expected[index]) assert.ok(card.includes(text), `Missing ${text}`);
  });
  assert.doesNotMatch(html, /SSO|SCIM|Microsoft Entra|Google Workspace|Private deployment|\$49/);
  assert.doesNotMatch(html, /Custody DID|Managed DID Identity|Organization-Owned DID|Pay-As-Use/);
  assert.match(html, /All prices are in Singapore dollars/);
  assert.equal((html.match(/href="\/contact"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /<button/);
});

test("additional services, comparison, benefits, custom contact and metadata match enterprise copy", () => {
  const { html, metadata } = render();
  for (const text of [
    "Enterprise Plans", "Simple, Transparent Pricing for Digital Credential Management",
    "SGD 59 / Template", "One-Time Setup Fee", "SGD 0.99 / Certificate", "Only pay for certificates that are issued.",
    "Self-Managed DID Portal", "Issuer Verification Key Management", "DID Document Generation", "Downloadable did.json Files",
    "Multi-Issuer Verification Support", "Full Identity Ownership", "Tamper-Proof Digital Credentials",
    "Instant Online Verification", "Certificate Revocation &amp; Lifecycle Management", "Organization Branding",
    "Multi-Issuer Support", "Managed or Self-Managed DID", "No Technical Knowledge Required", "Secure Cloud Platform",
    "Open Standards Compatible", "Need a Custom Solution?", "mailto:support@verifiable.sg",
    "All plans include certificate verification, revocation support, and secure digital credential hosting.",
    "50 Certificates/Month", "1,000 Certificates/Month", "Annual Credit Carry Forward",
    "Optional Self-Managed DID Portal: SGD 599", "SGD 299 Onboarding",
  ]) assert.ok(html.includes(text), `Missing content: ${text}`);
  assert.match(html, /<table/);
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /md:grid-cols-2 xl:grid-cols-3/);
  assert.equal(metadata.title, "Enterprise Pricing | Verifiable.sg");
  assert.equal(metadata.description, "Transparent pricing for issuing, managing and verifying digital credentials with managed or self-managed digital identities.");
});
