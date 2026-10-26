const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("tailwind dark variants follow the theme toggle, not the OS", () => {
  assert.match(read("tailwind.config.ts"), /darkMode:\s*["']class["']/);
});

test("root layout applies the stored theme before first paint", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /trustvc-theme/);
  assert.match(layout, /dangerouslySetInnerHTML=\{\{\s*__html:\s*themeInitScript/);
  assert.match(layout, /suppressHydrationWarning/);
});

test("NavBar toggle uses the same storage key as the init script", () => {
  assert.match(read("components/NavBar.tsx"), /trustvc-theme/);
});

test("NavBar wordmark stays readable in both themes", () => {
  const navbar = read("components/NavBar.tsx");
  assert.match(navbar, /verifiable-logo-light\.svg"[^>]*dark:hidden/);
  assert.match(navbar, /verifiable-logo\.svg"[^>]*hidden[^>]*dark:block/);
});

test("global dark theme never restyles certificate paper", () => {
  const css = read("app/globals.css");
  const darkRules = css.split("\n").filter((line) => /^\s*\.dark \.(bg|text|border)-/.test(line));
  assert.ok(darkRules.length > 20, "expected global dark remap rules");
  for (const rule of darkRules) {
    if (/^\s*\.dark \.bg-slate-900\.text-white/.test(rule)) continue;
    assert.match(rule, /certificate-paper|,\s*$/, `rule must exclude .certificate-paper: ${rule.trim()}`);
  }
});

test("certificate previews are marked as certificate paper", () => {
  for (const file of [
    "app/templates/CertificateTemplateRenderer.tsx",
    "app/verify/page.tsx",
    "app/insurance/page.tsx",
    "app/renderer/page.tsx",
    "app/templates/builder/page.tsx",
    "components/CertificatePreviewModal.tsx",
  ]) {
    assert.match(read(file), /certificate-paper/, file);
  }
});
