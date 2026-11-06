const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");

function load(file) {
  const filename = path.resolve(root, file);
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (name === "next/link") return { default: ({ prefetch, ...props }) => React.createElement("a", props) };
    if (name === "next/navigation") return { notFound() { throw new Error("NOT_FOUND"); } };
    if (name.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.tsx`)).replace(/\.tsx$/, existsSync(path.resolve(path.dirname(filename), `${name}.tsx`)) ? ".tsx" : ".ts"));
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}

test("public catalog has all requested industries, capabilities and resources", () => {
  const { solutions, capabilities, resourcePages } = load("lib/marketing.ts");
  assert.deepEqual(solutions.map(item => item.slug), ["training-providers", "professional-associations", "universities", "corporate-learning", "certification-bodies"]);
  assert.deepEqual(capabilities.map(item => item.slug), ["organization-management", "issuer-management", "credential-management", "digital-identity", "verification", "security"]);
  assert.equal(resourcePages.length, 5);
  for (const entry of [...solutions, ...capabilities]) {
    assert.ok(entry.challenge && entry.outcome);
    assert.equal(entry.benefits.length, 3);
    assert.equal(entry.useCases.length, 3);
  }
});

test("home renders approved positioning, real lifecycle and conversion links", () => {
  const page = load("app/page.tsx");
  const html = renderToStaticMarkup(React.createElement(page.default));
  assert.match(html, /Trusted Digital Credentials\. Instant Verification\./);
  for (const text of ["Book Demo", "Start Free Consultation", "Issue", "Manage", "Verify", "Revoke", "Audit", "SGD 49/month", "SGD 299/month", "From SGD 899/month"]) assert.ok(html.includes(text), text);
  assert.match(html, /href="\/verify"/);
  assert.doesNotMatch(html, /href="\/dashboard"|href="\/organizations"|Trusted by|SOC 2|ISO 27001/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal(page.metadata.alternates.canonical, "https://verifiable.sg/");
});

test("public detail routes resolve every catalog entry and reject unknown slugs", async () => {
  const catalog = load("lib/marketing.ts");
  for (const [file, entries] of [
    ["app/solutions/[slug]/page.tsx", catalog.solutions],
    ["app/platform/[slug]/page.tsx", catalog.capabilities],
    ["app/resources/[slug]/page.tsx", catalog.resourcePages],
  ]) {
    const page = load(file);
    assert.equal(page.dynamicParams, false);
    assert.equal(page.generateStaticParams().length, entries.length);
    for (const entry of entries) {
      const props = { params: Promise.resolve({ slug: entry.slug }) };
      const html = renderToStaticMarkup(await page.default(props));
      assert.ok(html.includes(entry.title.replaceAll("&", "&amp;")));
      assert.ok((await page.generateMetadata(props)).alternates.canonical.endsWith(`/${entry.slug}/`));
    }
    await assert.rejects(page.default({ params: Promise.resolve({ slug: "not-a-page" }) }), /NOT_FOUND/);
  }
});

test("public navigation routes exist and private platform overview stays server-authorized", () => {
  const nav = load("lib/navigation.ts");
  for (const item of nav.publicNavigation) assert.ok(existsSync(path.join(root, "app", item.href, "page.tsx")), item.href);
  assert.equal(nav.isWorkspacePage("/platform"), false);
  assert.equal(nav.isWorkspacePage("/platform/dashboard"), true);
  const source = readFileSync(path.join(root, "app/platform/dashboard/page.tsx"), "utf8");
  assert.ok(source.indexOf('hasPermission(user, "organizations.manage")') < source.indexOf("await getPlatformStats()"));
});

test("SEO includes public discovery pages only and canonical pricing preserves the old route", () => {
  const entries = load("app/sitemap.ts").default();
  assert.equal(entries.length, 25);
  for (const privatePath of ["/platform/dashboard/", "/identity-trust/", "/credentials/", "/billing/"]) {
    assert.equal(entries.some(entry => entry.url.endsWith(privatePath)), false);
    assert.ok(load("app/robots.ts").default().rules.disallow.includes(privatePath));
  }
  assert.equal(new Set(entries.map(entry => entry.url)).size, entries.length);
  assert.equal(load("app/enterprise/page.tsx").metadata.alternates.canonical, "https://verifiable.sg/pricing/");
});

test("demo, consultation and sales links target explicit mailbox-backed flows", () => {
  const html = renderToStaticMarkup(React.createElement(load("app/contact/page.tsx").default));
  for (const id of ["demo", "consultation", "sales"]) assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /does not reserve a meeting/);
  assert.match(html, /mailto:support@verifiable\.sg\?subject=Verifiable.sg%20demo%20request/);
  assert.doesNotMatch(html, /<strong>Legal entity name:<\/strong>/);
});

test("public company and partnership pages identify Verifiable.sg independently", async () => {
  const about = load("app/about/page.tsx");
  const aboutHtml = renderToStaticMarkup(React.createElement(about.default));
  assert.match(aboutHtml, /About Verifiable\.sg/);
  assert.match(aboutHtml, /independent Credential-as-a-Service platform/);
  assert.match(about.metadata.title, /Verifiable\.sg/);
  assert.doesNotMatch(aboutHtml, /\bIBS\b|Powered by Verifiable\.sg/);

  const partners = load("app/partners/page.tsx");
  const partnersHtml = renderToStaticMarkup(React.createElement(partners.default));
  assert.match(partnersHtml, /not a directory of established partnerships/);
  assert.match(partners.metadata.description, /Verifiable\.sg/);
  assert.doesNotMatch(partnersHtml, /\bIBS\b|Powered by Verifiable\.sg/);

  const contactHtml = renderToStaticMarkup(React.createElement(load("app/contact/page.tsx").default));
  assert.doesNotMatch(contactHtml, /\bIBS\b|Powered by Verifiable\.sg/);
});

test("dark primary buttons meet WCAG AA normal-text contrast in default and hover states", () => {
  const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
  function luminance(hex) {
    const linear = hex.match(/[\da-f]{2}/gi).map(value => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  }
  for (const selector of [".dark .btn-primary", ".dark .btn-primary:hover"]) {
    const color = css.slice(css.indexOf(`${selector} {`)).match(/background-color: (#[\da-f]{6})/)[1];
    assert.ok(1.05 / (luminance(color) + 0.05) >= 4.5, `${selector} ${color}`);
  }
});
