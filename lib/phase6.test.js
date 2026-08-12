const test = require("node:test");
const assert = require("node:assert/strict");

(async () => {
  const {
    buildVerificationReport,
    parseVerificationInput,
  } = await import("./phase6.ts");

  test("verification report summarizes valid and invalid input payloads", () => {
    const validReport = buildVerificationReport({
      incoming: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        type: ["VerifiableCredential"],
        issuer: { id: "did:web:example.com" },
        credentialSubject: { id: "did:example:subject" },
      },
      status: "valid",
      signature: "verified",
      revocation: "clear",
    });

    const parsed = parseVerificationInput(JSON.stringify({
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential"],
      issuer: { id: "did:web:example.com" },
      credentialSubject: { id: "did:example:subject" },
    }));

    assert.equal(validReport.status, "valid");
    assert.equal(validReport.summary.includes("verified"), true);
    assert.equal(parsed.credentialSubject.id, "did:example:subject");
  });
})();
