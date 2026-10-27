const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const javascript = ts.transpileModule(readFileSync(`${__dirname}/page.tsx`, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const templates = [
  { id: "saved-fta", slug: "fta", name: "FTA Academy", description: "Academy certificate." },
  { id: "saved-modern", slug: "modern", name: "Modern Training", description: "Modern certificate." },
];

function setup(catalog = { templates, loading: false, error: null }) {
  let selectedId = "";
  const previews = [];
  const module = { exports: {} };
  new Function("require", "module", "exports", javascript)((name) => {
    if (name === "react") return {
      useState: () => [selectedId, (value) => { selectedId = value; }],
    };
    if (name === "../../hooks/useIssuanceTemplates") return { useIssuanceTemplates: () => catalog };
    if (name === "../templates/CertificateTemplateRenderer") return {
      default: ({ certificate }) => {
        previews.push(certificate);
        return React.createElement("div", { "data-template": certificate.templateId }, certificate.recipientName);
      },
    };
    assert.ok(["react/jsx-runtime", "lucide-react"].includes(name), `Unexpected dependency: ${name}`);
    return require(name);
  }, module, module.exports);
  return {
    render: () => module.exports.default(),
    html: () => renderToStaticMarkup(module.exports.default()),
    previews,
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

test("Branding defaults to the first saved template and passes its layout slug to the preview", () => {
  const { html, previews } = setup();
  const output = html();
  assert.match(output, /value="saved-fta" selected=""/);
  assert.match(output, /FTA Academy preview/);
  assert.match(output, /Academy certificate/);
  assert.equal(previews.length, 1);
  assert.equal(previews[0].templateId, "fta");
  assert.equal(previews[0].recipientName, "Sample Recipient");
  assert.match(output, /Sample data only/);
  assert.doesNotMatch(output, /OpenClaw|Brand configuration/);
});

test("selecting a different template updates both description and preview", () => {
  const page = setup();
  const dropdown = find(page.render(), (node) => node.type === "select");
  assert.equal(dropdown.props.value, "saved-fta");
  assert.equal(dropdown.props.disabled, false);
  dropdown.props.onChange({ target: { value: "saved-modern" } });
  const output = page.html();
  assert.match(output, /value="saved-modern" selected=""/);
  assert.match(output, /Modern Training preview/);
  assert.match(output, /Modern certificate/);
  assert.equal(page.previews.at(-1).templateId, "modern");
});

test("asynchronous catalog arrival selects the first template and stale selections cannot persist", () => {
  const catalog = { templates: [], loading: true, error: null };
  const page = setup(catalog);
  assert.equal(find(page.render(), (node) => node.type === "select").props.value, "");
  catalog.templates = templates;
  catalog.loading = false;
  assert.equal(find(page.render(), (node) => node.type === "select").props.value, "saved-fta");
  find(page.render(), (node) => node.type === "select").props.onChange({ target: { value: "saved-modern" } });
  catalog.templates = [templates[0]];
  assert.equal(find(page.render(), (node) => node.type === "select").props.value, "saved-fta");
  page.html();
  assert.equal(page.previews.at(-1).templateId, "fta");
});

test("loading, failed and empty catalogs show explicit states without a preview", () => {
  for (const [catalog, message, role] of [
    [{ templates: [], loading: true, error: null }, /Loading available templates/, "status"],
    [{ templates, loading: false, error: "Unable to load available templates." }, /Unable to load available templates/, "alert"],
    [{ templates: [], loading: false, error: null }, /No active saved templates are available/, "status"],
  ]) {
    const page = setup(catalog);
    assert.equal(find(page.render(), (node) => node.type === "select").props.disabled, true);
    const output = page.html();
    assert.match(output, message);
    assert.match(output, new RegExp(`role="${role}"`));
    assert.equal(page.previews.length, 0);
  }
});
