const test = require("node:test");
const assert = require("node:assert/strict");

(async () => {
  const { createDefaultPlatform, createIssuerRepository } = await import("./platform.ts");

  test("repository can create and toggle issuer status", () => {
    const platform = createDefaultPlatform();
    const repo = createIssuerRepository(platform);
    const issuer = repo.createIssuer({
      organizationId: platform.organizations[0].id,
      name: "Operations",
      slug: "operations",
      contactEmail: "ops@example.com",
    });

    assert.equal(repo.listIssuers().length, 1);
    assert.equal(issuer.status, "active");
    assert.equal(repo.updateIssuerStatus(issuer.id, "disabled").status, "disabled");
  });
})();
