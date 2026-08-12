const test = require("node:test");
const assert = require("node:assert/strict");

(async () => {
  const {
    createDefaultPlatform,
    createIssuerWorkspace,
    canIssueCredentials,
    getIssuerBySlug,
    setIssuerStatus,
    hasRole,
    createIssuerRepository,
    listIssuers,
    authorize,
    createIssuerBranding,
    updateIssuerBranding,
    createDIDRecord,
    rotateDIDRecord,
    deactivateDIDRecord,
    canUseDID,
  } = await import("./platform.ts");

  test("creates an active issuer workspace from the default platform seed data", () => {
    const platform = createDefaultPlatform();
    const issuer = createIssuerWorkspace(platform, {
      organizationId: platform.organizations[0].id,
      name: "Learning Services",
      slug: "learning-services",
      contactEmail: "issuing@example.com",
    });

    assert.equal(platform.organizations.length >= 1, true);
    assert.equal(issuer.status, "active");
    assert.equal(canIssueCredentials(issuer), true);
  });

  test("disabled or suspended issuers cannot issue credentials", () => {
    const platform = createDefaultPlatform();
    const issuer = createIssuerWorkspace(platform, {
      organizationId: platform.organizations[0].id,
      name: "Learning Services",
      slug: "learning-services",
      contactEmail: "issuing@example.com",
    });

    const disabledIssuer = setIssuerStatus(platform, issuer.id, "disabled");
    const suspendedIssuer = setIssuerStatus(platform, issuer.id, "suspended");

    assert.equal(getIssuerBySlug(platform, "learning-services")?.id, issuer.id);
    assert.equal(canIssueCredentials(disabledIssuer), false);
    assert.equal(canIssueCredentials(suspendedIssuer), false);
  });

  test("role checks support issuer permissions", () => {
    const user = {
      id: "user-issuer",
      name: "Issuer Operator",
      email: "issuer@example.com",
      roles: ["issuer-admin", "issuer-operator"],
    };

    assert.equal(hasRole(user, "issuer-admin"), true);
    assert.equal(hasRole(user, "platform-admin"), false);
  });

  test("repository layer lists and updates issuer status", () => {
    const platform = createDefaultPlatform();
    const repo = createIssuerRepository(platform);

    const created = repo.createIssuer({
      organizationId: platform.organizations[0].id,
      name: "Credential Services",
      slug: "credential-services",
      contactEmail: "ops@example.com",
    });

    assert.equal(listIssuers(platform).length, 1);
    assert.equal(created.status, "active");

    const updated = repo.updateIssuerStatus(created.id, "disabled");
    assert.equal(updated.status, "disabled");
    assert.equal(canIssueCredentials(updated), false);
  });

  test("role-based authorization allows admin actions and blocks unauthorized ones", () => {
    const platform = createDefaultPlatform();
    const admin = platform.users[0];
    const operator = platform.users[1];

    assert.equal(authorize(admin, "create-issuer"), true);
    assert.equal(authorize(operator, "create-issuer"), true);
    assert.equal(authorize(operator, "platform-settings"), false);
  });

  test("issuer branding metadata updates are persisted and visible in the workspace", () => {
    const platform = createDefaultPlatform();
    const issuer = createIssuerWorkspace(platform, {
      organizationId: platform.organizations[0].id,
      name: "Brand Studio",
      slug: "brand-studio",
      contactEmail: "brand@example.com",
    });

    const branding = createIssuerBranding(issuer.id, {
      logoUrl: "https://example.com/logo.png",
      themeColor: "#111827",
      website: "https://example.com",
      description: "Trusted credential issuer",
      verificationBranding: "OpenClaw Verified",
    });

    const updated = updateIssuerBranding(issuer.id, {
      themeColor: "#2563eb",
    });

    assert.equal(branding.logoUrl, "https://example.com/logo.png");
    assert.equal(updated.themeColor, "#2563eb");
    assert.equal(updated.description, "Trusted credential issuer");
  });

  test("DID lifecycle supports generation, rotation, and deactivation", () => {
    const platform = createDefaultPlatform();
    const issuer = createIssuerWorkspace(platform, {
      organizationId: platform.organizations[0].id,
      name: "DID Studio",
      slug: "did-studio",
      contactEmail: "did@example.com",
    });

    const did = createDIDRecord(issuer.id, {
      didUri: "did:web:example.com:issuer",
      keyId: "did:web:example.com:issuer#key-1",
      status: "active",
    });

    const rotated = rotateDIDRecord(issuer.id, did.id, {
      keyId: "did:web:example.com:issuer#key-2",
    });
    const disabled = deactivateDIDRecord(issuer.id, rotated.id);

    assert.equal(canUseDID(did), true);
    assert.equal(canUseDID(rotated), true);
    assert.equal(canUseDID(disabled), false);
  });
})();
