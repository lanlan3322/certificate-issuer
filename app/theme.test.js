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

test("NavBar displays the matching cropped logo for each theme", () => {
  const navbar = read("components/NavBar.tsx");
  assert.match(navbar, /src="\/vs-light\.png"[^>]*alt="Verifiable.sg"[^>]*dark:hidden/);
  assert.match(navbar, /src="\/vs-dark\.png"[^>]*alt="Verifiable.sg"[^>]*className="hidden[^"]*dark:block/);
  assert.equal((navbar.match(/<img\b/g) ?? []).length, 2);
  assert.doesNotMatch(navbar, /src="\/vs\.png"/);
  for (const name of ["vs-light.png", "vs-dark.png"]) {
    const png = fs.readFileSync(path.join(root, "public", name));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 1420);
    assert.equal(png.readUInt32BE(20), 300);
  }
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
