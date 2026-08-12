const test = require("node:test");
const assert = require("node:assert/strict");

(async () => {
  const {
    buildVerificationLink,
    createEmailDelivery,
    createVerificationBundle,
  } = await import("./phase4.ts");

  test("verification links and QR bundle are generated for recipient delivery", () => {
    const link = buildVerificationLink("https://example.com/verify", "cert-123");
    const delivery = createEmailDelivery({
      recipientEmail: "student@example.com",
      recipientName: "Alicia Tan",
      credentialId: "cert-123",
      verificationUrl: link,
    });

    const bundle = createVerificationBundle({
      credentialId: "cert-123",
      verificationUrl: link,
      recipientEmail: "student@example.com",
    });

    assert.match(link, /cert-123/);
    assert.equal(delivery.to, "student@example.com");
    assert.equal(delivery.subject.includes("Alicia Tan"), true);
    assert.equal(bundle.verificationUrl, link);
    assert.equal(bundle.qrPayload.includes("cert-123"), true);
  });
})();
