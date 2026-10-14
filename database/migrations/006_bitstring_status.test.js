const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

test("status SQL allocates durable indices, snapshots lifecycle and atomically records transitions", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TYPE credential_status AS ENUM ('issued','revoked','suspended','expired');
    CREATE TABLE issuers (id UUID PRIMARY KEY);
    CREATE TABLE credentials (id UUID PRIMARY KEY, issuer_id UUID REFERENCES issuers,
      external_id TEXT UNIQUE, status credential_status NOT NULL DEFAULT 'issued');
    CREATE TABLE revocations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      credential_id UUID REFERENCES credentials, issuer_id UUID REFERENCES issuers,
      action TEXT, reason TEXT, transaction_hash TEXT, created_at TIMESTAMPTZ DEFAULT now());
  `);
  await db.exec(readFileSync(`${__dirname}/006_bitstring_status.sql`, "utf8"));
  const issuer = "00000000-0000-4000-8000-000000000001";
  const credential = "00000000-0000-4000-8000-000000000002";
  const other = "00000000-0000-4000-8000-000000000003";
  await db.query("INSERT INTO issuers VALUES ($1), ($2)", [issuer, other]);
  const reserve = async (id) => (await db.query(
    "SELECT reserve_bitstring_status($1,$2) AS allocation", [issuer, id]
  )).rows[0].allocation;
  const snapshot = async (page) => (await db.query(
    "SELECT read_bitstring_status($1) AS entries", [page]
  )).rows[0].entries;
  assert.equal(Number(await reserve("first")), 0);
  assert.deepEqual(await snapshot(0), [{ index: 0, status: "revoked" }],
    "unpersisted allocations fail closed");
  await assert.rejects(reserve("first"), /duplicate key/);
  assert.equal(Number(await reserve("second")), 2, "failed reservations never reuse sequence slots");
  await assert.rejects(reserve(null), /Invalid credential identifier/);
  await assert.rejects(reserve("  "), /Invalid credential identifier/);
  await db.query("INSERT INTO credentials(id,issuer_id,external_id) VALUES ($1,$2,'first')",
    [credential, issuer]);
  assert.equal((await snapshot(0)).find((entry) => entry.index === 0).status, "issued");
  const apply = (action, tenant = issuer) => db.query(
    "SELECT apply_bitstring_revocation($1,$2,$3,'test reason',NULL) AS record",
    [credential, tenant, action]
  );
  await assert.rejects(apply("suspend", other), /not found/);
  await assert.rejects(apply(null), /Invalid revocation action/);
  assert.equal((await apply("suspend")).rows[0].record.credential_status, "suspended");
  assert.equal((await snapshot(0)).find((entry) => entry.index === 0).status, "suspended");
  assert.equal((await apply("reinstate")).rows[0].record.credential_status, "issued");
  await apply("revoke");
  assert.equal((await snapshot(0)).find((entry) => entry.index === 0).status, "revoked");
  await assert.rejects(apply("reinstate"), /Invalid credential status transition/);
  assert.equal((await db.query("SELECT count(*) FROM revocations")).rows[0].count, 3);
  await db.query("UPDATE credentials SET status='issued' WHERE id=$1", [credential]);
  await db.exec(`CREATE FUNCTION reject_log() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'test log failure'; END; $$;
    CREATE TRIGGER reject_log BEFORE INSERT ON revocations FOR EACH ROW EXECUTE FUNCTION reject_log();`);
  await assert.rejects(apply("revoke"), /test log failure/);
  assert.equal((await snapshot(0)).find((entry) => entry.index === 0).status, "issued",
    "failed transition log rolls back credential status");
  await db.exec("ALTER SEQUENCE bitstring_status_allocations_allocation_seq RESTART WITH 131072");
  assert.equal(Number(await reserve("next-page")), 131072);
  assert.deepEqual(await snapshot(1), [{ index: 0, status: "revoked" }]);
  assert.equal(await snapshot(2), null);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query("SELECT read_bitstring_status(0)"), /permission denied/);
    await assert.rejects(db.query("SELECT * FROM bitstring_status_allocations"), /permission denied/);
    await db.exec("RESET ROLE");
  }
  await db.exec("SET ROLE service_role");
  assert.ok(await snapshot(0));
  await db.exec("RESET ROLE");
});
