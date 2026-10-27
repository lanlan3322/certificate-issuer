const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const migration = readFileSync(`${__dirname}/013_fintech_academy_fta_template.sql`, "utf8");
const org = "00000000-0000-4000-8000-000000000001";
const otherOrg = "00000000-0000-4000-8000-000000000002";
const issuer = "00000000-0000-4000-8000-000000000003";
const otherIssuer = "00000000-0000-4000-8000-000000000004";

async function setup(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE organizations (id UUID PRIMARY KEY, name TEXT NOT NULL, status TEXT DEFAULT 'active');
    CREATE TABLE issuers (
      id UUID PRIMARY KEY, organization_id UUID REFERENCES organizations,
      name TEXT NOT NULL, status TEXT DEFAULT 'active'
    );
    CREATE TABLE templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), issuer_id UUID REFERENCES issuers,
      slug TEXT NOT NULL, name TEXT, description TEXT, definition JSONB,
      is_active BOOLEAN DEFAULT true, issuer_profile_id UUID,
      UNIQUE (issuer_id, slug)
    );
    CREATE TABLE audit_logs (
      organization_id UUID REFERENCES organizations, issuer_id UUID REFERENCES issuers,
      action TEXT, entity_type TEXT, entity_id UUID, metadata JSONB
    );
  `);
  await db.query("INSERT INTO organizations (id,name) VALUES ($1,'Fintech Academy'),($2,'Other Academy')", [org, otherOrg]);
  await db.query("INSERT INTO issuers (id,organization_id,name) VALUES ($1,$2,'Laurence'),($3,$4,'Laurence')",
    [issuer, org, otherIssuer, otherOrg]);
  return db;
}

test("FTA is linked only to Laurence in Fintech Academy and repeated execution is safe", async (t) => {
  const db = await setup(t);
  await db.exec(migration);
  const first = (await db.query("SELECT * FROM templates")).rows[0];
  assert.equal(first.issuer_id, issuer);
  assert.equal(first.slug, "fta");
  assert.equal(first.name, "FTA Academy");
  assert.equal(first.is_active, true);
  assert.equal(first.definition.renderer, "fta");
  assert.equal(first.issuer_profile_id, null);
  await db.exec(migration);
  assert.deepEqual((await db.query("SELECT * FROM templates")).rows, [first]);
  const logs = (await db.query("SELECT * FROM audit_logs")).rows;
  assert.equal(logs.length, 1);
  assert.equal(logs[0].organization_id, org);
  assert.equal(logs[0].issuer_id, issuer);
  assert.equal(logs[0].entity_id, first.id);
  assert.equal(logs[0].action, "template.saved");
});

test("an existing active FTA record and signing-profile assignment are preserved", async (t) => {
  const db = await setup(t);
  await db.query(`INSERT INTO templates (issuer_id,slug,name,definition,issuer_profile_id)
    VALUES ($1,'fta','Customized FTA','{"custom":true}',$2)`, [issuer, otherIssuer]);
  const before = (await db.query("SELECT * FROM templates")).rows;
  await db.exec(migration);
  assert.deepEqual((await db.query("SELECT * FROM templates")).rows, before);
  assert.equal((await db.query("SELECT count(*) FROM audit_logs")).rows[0].count, 0);
});

test("missing, ambiguous, or disabled targets fail without creating a template", async (t) => {
  for (const [label, change, error] of [
    ["missing organization", "UPDATE organizations SET name='Renamed' WHERE name='Fintech Academy'", /organization; found 0/],
    ["ambiguous organization", "INSERT INTO organizations VALUES (gen_random_uuid(),'Fintech Academy','active')", /organization; found 2/],
    ["disabled organization", "UPDATE organizations SET status='disabled' WHERE name='Fintech Academy'", /organization must be active/],
    ["missing issuer", "UPDATE issuers SET name='Renamed'", /issuer in Fintech Academy; found 0/],
    ["ambiguous issuer", `INSERT INTO issuers VALUES (gen_random_uuid(),'${org}','Laurence','active')`, /issuer in Fintech Academy; found 2/],
    ["disabled issuer", `UPDATE issuers SET status='disabled' WHERE id='${issuer}'`, /issuer in Fintech Academy must be active/],
  ]) {
    await t.test(label, async (t) => {
      const db = await setup(t);
      await db.exec(change);
      await assert.rejects(db.exec(migration), error);
      assert.equal((await db.query("SELECT count(*) FROM templates")).rows[0].count, 0);
      assert.equal((await db.query("SELECT count(*) FROM audit_logs")).rows[0].count, 0);
    });
  }
});

test("inactive existing FTA is not silently reactivated", async (t) => {
  const db = await setup(t);
  await db.query("INSERT INTO templates (issuer_id,slug,is_active) VALUES ($1,'fta',false)", [issuer]);
  await assert.rejects(db.exec(migration), /inactive FTA template/);
  assert.equal((await db.query("SELECT is_active FROM templates")).rows[0].is_active, false);
  assert.equal((await db.query("SELECT count(*) FROM audit_logs")).rows[0].count, 0);
});
