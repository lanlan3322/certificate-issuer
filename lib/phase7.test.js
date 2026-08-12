const test = require("node:test");
const assert = require("node:assert/strict");

(async () => {
  const {
    createAuditEvent,
    buildComplianceSummary,
  } = await import("./phase7.ts");

  test("audit events and compliance summary are generated for issued credentials", () => {
    const issued = createAuditEvent({
      credentialId: "cert-100",
      actor: "issuer-ops",
      action: "issued",
      status: "success",
      metadata: { templateId: "classic" },
    });

    const revoked = createAuditEvent({
      credentialId: "cert-100",
      actor: "compliance-review",
      action: "revoked",
      status: "success",
      metadata: { reason: "Policy review" },
    });

    const summary = buildComplianceSummary([issued, revoked]);

    assert.equal(issued.credentialId, "cert-100");
    assert.equal(summary.totalEvents, 2);
    assert.equal(summary.statusCounts.success, 2);
    assert.equal(summary.credentialIds.includes("cert-100"), true);
  });
})();
