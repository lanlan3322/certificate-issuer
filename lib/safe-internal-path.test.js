const test = require("node:test");
const assert = require("node:assert/strict");
const { safeInternalPath } = require("./safe-internal-path.ts");

test("safeInternalPath preserves internal routes and query strings", () => {
  assert.equal(safeInternalPath("/issuer/templates?tab=active#list"), "/issuer/templates?tab=active#list");
  assert.equal(safeInternalPath("/issuer/"), "/issuer/");
});

test("safeInternalPath rejects external and malformed destinations", () => {
  for (const value of [
    "//attacker.example/path",
    "///attacker.example/path",
    "https://attacker.example",
    "\\\\attacker.example",
    "/\\attacker.example",
    "/%5c%5cattacker.example",
    "/bad\u0000path",
  ]) {
    assert.equal(safeInternalPath(value), "/issuer/", String(value));
  }
  assert.equal(safeInternalPath(null), "/issuer/");
});
