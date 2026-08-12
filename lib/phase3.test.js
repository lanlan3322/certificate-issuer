const test = require("node:test");
const assert = require("node:assert/strict");

(async () => {
  const {
    createTemplateDefinition,
    renderTemplateText,
    createRevocationRecord,
    revokeCredential,
    suspendCredential,
    reinstateCredential,
  } = await import("./phase3.ts");

  test("template definitions support preview text interpolation and dynamic fields", () => {
    const template = createTemplateDefinition({
      name: "Learning Certificate",
      title: "Certificate of {{certificateType}}",
      subtitle: "Awarded to {{recipientName}}",
      accentColor: "#0f172a",
      description: "Issued by {{issuerName}}",
      fields: [
        { key: "recipientName", label: "Recipient", value: "Alicia Tan", required: true },
        { key: "certificateType", label: "Course", value: "AI Governance", required: true },
      ],
    });

    const rendered = renderTemplateText(template, {
      recipientName: "Alicia Tan",
      certificateType: "AI Governance",
      issuerName: "OpenClaw Academy",
    });

    assert.equal(template.name, "Learning Certificate");
    assert.equal(template.fields.length, 2);
    assert.match(rendered.title, /AI Governance/);
    assert.match(rendered.subtitle, /Alicia Tan/);
    assert.match(rendered.description, /OpenClaw Academy/);
  });

  test("revocation lifecycle supports revoke, suspend, and reinstate transitions", () => {
    const record = createRevocationRecord("cert-123", "Issued for onboarding");

    const revoked = revokeCredential(record, "Policy violation");
    assert.equal(revoked.status, "revoked");
    assert.equal(revoked.history.length >= 2, true);

    const suspended = suspendCredential(revoked, "Under review");
    assert.equal(suspended.status, "suspended");

    const reinstated = reinstateCredential(suspended, "Cleared");
    assert.equal(reinstated.status, "active");
    assert.equal(reinstated.history[reinstated.history.length - 1].action, "reinstate");
  });
})();
