const assert = require("node:assert/strict");
const test = require("node:test");

test("certificate QR links open the verify page for that certificate", async () => {
  const { buildVerificationUrl } = await import("./site.ts");

  assert.equal(
    buildVerificationUrl("https://verifiable.sg", "urn:uuid:ae0a5786-157e-4a56-907e-f6af85a9e741"),
    "https://verifiable.sg/verify/?id=urn%3Auuid%3Aae0a5786-157e-4a56-907e-f6af85a9e741"
  );
  assert.equal(buildVerificationUrl("https://verifiable.sg", " "), "https://verifiable.sg/verify/");
  assert.equal(buildVerificationUrl("https://verifiable.sg"), "https://verifiable.sg/verify/");
});
