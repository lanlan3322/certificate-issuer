const test = require("node:test");
const assert = require("node:assert/strict");

(async () => {
  const {
    buildBulkIssuanceJob,
    validateBulkRows,
    summarizeBulkJob,
  } = await import("./phase5.ts");

  test("bulk issuance job validates rows and summarizes deliveries", () => {
    const rows = [
      { recipientName: "Alicia Tan", recipientEmail: "alicia@example.com", certificateType: "AI Governance" },
      { recipientName: "Ben Lee", recipientEmail: "ben@example.com", certificateType: "Data Ethics" },
      { recipientName: "Cara Ng", recipientEmail: "invalid-email", certificateType: "Privacy" },
    ];

    const validation = validateBulkRows(rows);
    const job = buildBulkIssuanceJob({
      issuerName: "OpenClaw Academy",
      rows,
      templateId: "modern",
    });
    const summary = summarizeBulkJob(job);

    assert.equal(validation.valid, false);
    assert.equal(validation.errors[0].includes("invalid-email"), true);
    assert.equal(job.totalRecords, 3);
    assert.equal(summary.status, "ready");
    assert.equal(summary.validRows, 2);
  });
})();
