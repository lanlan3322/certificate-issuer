const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

test("profile status allocations and snapshots stay isolated by issuer profile", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TYPE credential_status AS ENUM ('issued','revoked','suspended','expired');
    CREATE TABLE issuers (id UUID PRIMARY KEY);
    CREATE TABLE issuer_profiles (
      id UUID PRIMARY KEY, owner_issuer_id UUID NOT NULL REFERENCES issuers(id),
      active BOOLEAN NOT NULL DEFAULT true, UNIQUE (id, owner_issuer_id)
    );
    CREATE TABLE credentials (
      id UUID PRIMARY KEY, issuer_id UUID REFERENCES issuers, issuer_profile_id UUID REFERENCES issuer_profiles,
      external_id TEXT UNIQUE, status credential_status NOT NULL DEFAULT 'issued'
    );
    CREATE TABLE revocations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      credential_id UUID REFERENCES credentials, issuer_id UUID REFERENCES issuers,
      action TEXT, reason TEXT, transaction_hash TEXT, created_at TIMESTAMPTZ DEFAULT now());
  `);
  await db.exec(readFileSync(`${__dirname}/006_bitstring_status.sql`, "utf8"));
  await db.exec(readFileSync(`${__dirname}/009_profile_status_lists.sql`, "utf8"));

  const issuer = "00000000-0000-4000-8000-000000000001";
  const otherIssuer = "00000000-0000-4000-8000-000000000002";
  const profileA = "00000000-0000-4000-8000-000000000003";
  const profileB = "00000000-0000-4000-8000-000000000004";
  await db.query("INSERT INTO issuers VALUES ($1),($2)", [issuer, otherIssuer]);
  await db.query("INSERT INTO issuer_profiles (id,owner_issuer_id) VALUES ($1,$2),($3,$4)",
    [profileA, issuer, profileB, issuer]);
  await db.query("INSERT INTO issuer_profiles (id,owner_issuer_id,active) VALUES ($1,$2,false)",
    ["00000000-0000-4000-8000-000000000005", issuer]);

  const reserve = async (tenant, profile, external) => (await db.query(
    "SELECT reserve_profile_bitstring_status($1,$2,$3) AS allocation",
    [tenant, profile, external]
  )).rows[0].allocation;
  const snapshot = async (profile, page = 0) => (await db.query(
    "SELECT read_profile_bitstring_status($1,$2) AS entries", [page, profile]
  )).rows[0].entries;

  const allocA = Number(await reserve(issuer, profileA, "profile-a-cert"));
  const allocB = Number(await reserve(issuer, profileB, "profile-b-cert"));
  assert.notEqual(allocA, allocB);
  await assert.rejects(reserve(otherIssuer, profileA, "wrong-tenant"), /Issuer profile not found/);
  await assert.rejects(reserve(issuer, "00000000-0000-4000-8000-000000000005", "inactive"),
    /Issuer profile not found/);
  await db.query(
    "INSERT INTO credentials (id,issuer_id,issuer_profile_id,external_id) VALUES ($1,$2,$3,$4)",
    ["00000000-0000-4000-8000-000000000006", issuer, profileA, "profile-a-cert"]
  );
  assert.deepEqual(await snapshot(profileA), [{ index: allocA, status: "issued" }]);
  assert.deepEqual(await snapshot(profileB), [{ index: allocB, status: "revoked" }],
    "allocations with no persisted credential fail closed within their own profile list");

  const result = await db.query(
    "SELECT apply_bitstring_revocation($1,$2,'revoke','policy',NULL) AS record",
    ["00000000-0000-4000-8000-000000000006", issuer]
  );
  assert.equal(result.rows[0].record.credential_status, "revoked");
  assert.deepEqual(await snapshot(profileA), [{ index: allocA, status: "revoked" }]);

  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query("SELECT read_profile_bitstring_status(0,$1)", [profileA]),
      /permission denied/);
    await assert.rejects(db.query("SELECT reserve_profile_bitstring_status($1,$2,'x')",
      [issuer, profileA]), /permission denied/);
    await db.exec("RESET ROLE");
  }
});
