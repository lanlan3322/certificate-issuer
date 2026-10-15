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

test("stored credentials saved as JSON text are verified as objects", async () => {
  const { parseStoredCredential } = await import("./stored-credential.ts");
  const credential = { "@context": ["https://www.w3.org/ns/credentials/v2"], id: "urn:uuid:x" };
  assert.deepEqual(parseStoredCredential(JSON.stringify(credential)), credential);
  assert.deepEqual(parseStoredCredential(credential), credential);
  assert.deepEqual(parseStoredCredential("not json"), {});
  assert.deepEqual(parseStoredCredential(null), {});
});
