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
  const cards = html.split('aria-labelledby="comparison-heading"')[0].split('<h3 class="text-lg font-semibold">').slice(1);
  assert.equal(cards.length, 3);
  const expected = [
    ["Starter", "SGD 49", "/ Month", "1 Issuer", "5 Certificate Templates", "100 Certificates Per Month", "resets each month", "Managed DID", "Basic Reporting", "Standard Support", "Start Free Consultation", "Membership organizations"],
    ["Professional", "SGD 199", "/ Month", "★ Most Popular", "Unlimited Issuers", "Unlimited Certificate Templates", "1,000 Certificates Per Month", "accumulate throughout the subscription year", "resets upon annual renewal", "Managed DID", "Advanced Reporting", "Priority Support", "Book a Demo", "Corporate learning departments"],
    ["Enterprise", "From SGD 499", "/ Month", "Unlimited Issuers", "Unlimited Templates", "Unlimited Certificates", "Dedicated Organization Portal", "Self-Managed DID", "Multi-Issuer DID Management", "DID Document Generator", "Verification Key Management", "Custom Branding", "API Access", "Bulk Issuance", "Priority Support", "Dedicated Onboarding", "Universities", "Regulatory bodies", "Enterprises", "Government projects", "Professional licensing authorities", "Contact Sales"],
  ];
  cards.forEach((card, index) => {
    for (const text of expected[index]) assert.ok(card.includes(text), `Missing ${text}`);
  });
  assert.doesNotMatch(html, /SSO|SCIM|Microsoft Entra|Google Workspace|Private deployment|\$49/);
  assert.doesNotMatch(html, /Custody DID|Managed DID Identity|Organization-Owned DID|Pay-As-Use/);
  assert.match(html, /All prices are in Singapore dollars/);
  assert.equal((html.match(/href="\/contact"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /Growth|Enterprise Flex|Additional Services|services-heading|One-Time|Onboarding Includes|SGD\s*(?:29|59|99|249|299|599|999|0\.99)\b/);
  assert.doesNotMatch(html, /<button/);
});

test("final comparison, benefits, custom contact and metadata match enterprise copy", () => {
  const { html, metadata } = render();
  for (const text of [
    "Enterprise Plans", "Simple, Transparent Pricing for Digital Credential Management",
    "Tamper-Proof Digital Credentials",
    "Instant Online Verification", "Certificate Revocation &amp; Lifecycle Management", "Organization Branding",
    "Multi-Issuer Support", "Managed or Self-Managed DID", "No Technical Knowledge Required", "Secure Cloud Platform",
    "Open Standards Compatible", "Need a Custom Solution?", "mailto:support@verifiable.sg",
    "All plans include certificate verification, revocation support, and secure digital credential hosting.",
    "100 Certificates/Month", "1,000 Certificates/Month", "Annual Credit Carry Forward",
    "SGD 49/month", "SGD 199/month", "From SGD 499/month", "5 Templates", "Dedicated Support",
  ]) assert.ok(html.includes(text), `Missing content: ${text}`);
  assert.match(html, /<table/);
  assert.equal((html.match(/scope="col"/g) ?? []).length, 4);
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /md:grid-cols-2 xl:grid-cols-3/);
  assert.equal(metadata.title, "Enterprise Pricing | Verifiable.sg");
  assert.equal(metadata.description, "Affordable digital credential infrastructure for organizations of all sizes. Issue, verify and manage trusted credentials with managed or self-managed digital identities.");
});
