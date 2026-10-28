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
    ["Starter", "SGD 49", "/ Month", "1 Issuer", "3 Certificate Templates", "100 Certificates Per Month", "resets each month", "Managed DID", "Basic Reporting", "Standard Support", "Start Free Consultation", "Membership organizations"],
    ["Professional", "SGD 299", "/ Month", "★ Most Popular", "Up to 5 Issuers", "Unlimited Certificate Templates", "1,000 Certificates Per Month", "accumulate throughout the subscription year", "resets upon annual renewal", "Managed DID", "Advanced Reporting", "Priority Support", "Book a Demo", "Corporate learning departments"],
    ["Enterprise", "From SGD 899", "/ Month", "Unlimited Issuers", "Unlimited Templates", "Unlimited Certificates", "Dedicated Organization Portal", "Self-Managed DID", "Multi-Issuer DID Management", "DID Document Generator", "Verification Key Management", "Custom Branding", "API Access", "Bulk Issuance", "Priority Support", "Dedicated Onboarding", "Universities", "Regulatory bodies", "Enterprises", "Government projects", "Professional licensing authorities", "Contact Sales"],
  ];
  cards.forEach((card, index) => {
    for (const text of expected[index]) assert.ok(card.includes(text), `Missing ${text}`);
  });
  assert.doesNotMatch(html, /SSO|SCIM|Microsoft Entra|Google Workspace|Private deployment|\$49/);
  assert.doesNotMatch(html, /Custody DID|Managed DID Identity|Organization-Owned DID|Pay-As-Use/);
  assert.match(html, /All prices are in Singapore dollars/);
  assert.equal((html.match(/href="\/contact"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /Growth|Enterprise Flex|Additional Services|services-heading|One-Time|Onboarding Includes|SGD\s*(?:59|99|249|599|999)\b/);
  for (const addon of ["Additional template: SGD29", "Additional certificate: SGD0.99", "Self-Managed DID: SGD299"]) {
    assert.ok(cards[0].includes(addon));
    assert.ok(cards[0].indexOf(addon) > cards[0].indexOf("Certificate allowance resets each month."));
    assert.ok(cards[0].indexOf(addon) < cards[0].indexOf("Ideal For"));
    assert.ok(cards.slice(1).every((card) => !card.includes(addon)));
  }
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
    "100 Certificates/Month", "1,000 Certificates/Month", "Monthly Credit Carry Forward",
    "SGD 49/month", "SGD 299/month", "From SGD 899/month", "3 Templates", "Dedicated Support",
  ]) assert.ok(html.includes(text), `Missing content: ${text}`);
  assert.match(html, /<table/);
  assert.equal((html.match(/scope="col"/g) ?? []).length, 4);
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /md:grid-cols-2 xl:grid-cols-3/);
  assert.equal(metadata.title, "Enterprise Pricing | Verifiable.sg");
  assert.equal(metadata.description, "Affordable digital credential infrastructure for organizations of all sizes. Issue, verify and manage trusted credentials with managed or self-managed digital identities.");
});

test("annual subscriptions appear under each monthly price with an exact 15 percent discount", () => {
  const { html } = render();
  const cards = html.split('aria-labelledby="comparison-heading"')[0].split('<h3 class="text-lg font-semibold">').slice(1);
  for (const [index, monthly] of [49, 299, 899].entries()) {
    const annual = (monthly * 12 * 0.85).toLocaleString("en-SG", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    const price = `${index === 2 ? "From " : ""}SGD ${annual}`;
    assert.ok(cards[index].includes(`${price} / Year`));
    assert.ok(cards[index].indexOf(`${price} / Year`) > cards[index].indexOf("/ Month"));
    assert.ok(cards[index].includes("Billed annually. Save 15% compared with 12 monthly payments."));
    assert.ok(html.includes(`${price}/year, billed annually`));
    const savings = (monthly * 12 * 0.15).toLocaleString("en-SG", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    const savingsLabel = `Save ${index === 2 ? "from " : ""}SGD ${savings}/year`;
    assert.ok(cards[index].includes(`${price} / Year — ${savingsLabel}`));
    assert.ok(html.includes(`${price}/year, billed annually. ${savingsLabel}`));
  }
});
