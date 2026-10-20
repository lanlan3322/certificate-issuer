const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

test("multi-issuer migration creates profile records and enforces tenant/template ownership", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE organizations (id UUID PRIMARY KEY);
    CREATE TABLE issuers (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id)
    );
    CREATE TABLE templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      issuer_id UUID REFERENCES issuers(id),
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      definition JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      issuer_id UUID NOT NULL REFERENCES issuers(id),
      template_id UUID REFERENCES templates(id)
    );
    CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $$;
    CREATE FUNCTION current_organization_id() RETURNS UUID LANGUAGE sql AS $$
      SELECT NULL::UUID;
    $$;
    CREATE FUNCTION has_role(TEXT) RETURNS BOOLEAN LANGUAGE sql AS $$
      SELECT FALSE;
    $$;
  `);
  await db.exec(readFileSync(`${__dirname}/008_multi_issuer_profiles.sql`, "utf8"));

  const orgA = "00000000-0000-4000-8000-000000000001";
  const orgB = "00000000-0000-4000-8000-000000000002";
  const issuerA = "00000000-0000-4000-8000-000000000003";
  const issuerB = "00000000-0000-4000-8000-000000000004";
  await db.query("INSERT INTO organizations VALUES ($1), ($2)", [orgA, orgB]);
  await db.query("INSERT INTO issuers VALUES ($1,$2), ($3,$4)", [issuerA, orgA, issuerB, orgB]);

  const profile = "00000000-0000-4000-8000-000000000005";
  await db.query(
    `INSERT INTO issuer_profiles
      (id, owner_issuer_id, issuer_name, display_name, did, verification_method, key_reference)
      VALUES ($1,$2,'FTA Academy','FTA Academy','did:web:fta.verifiable.sg',
        'did:web:fta.verifiable.sg#key-1','FTA_SIGNING_KEY')`,
    [profile, issuerA]
  );
  await assert.rejects(db.query(
    `INSERT INTO issuer_profiles
      (owner_issuer_id, issuer_name, display_name, did, verification_method, key_reference)
      VALUES ($1,'Duplicate','Duplicate','did:web:fta.verifiable.sg',
        'did:web:fta.verifiable.sg#key-2','FTA_SIGNING_KEY')`,
    [issuerA]
  ), /unique constraint/);
  await assert.rejects(db.query(
    `INSERT INTO issuer_profiles
      (owner_issuer_id, issuer_name, display_name, did, verification_method, key_reference)
      VALUES ($1,'Invalid','Invalid','did:web:fta.verifiable.sg',
        'did:web:abc.verifiable.sg#key-1','FTA_SIGNING_KEY')`,
    [issuerA]
  ), /violates check constraint/);
  await assert.rejects(db.query(
    `INSERT INTO issuer_profiles
      (owner_issuer_id, issuer_name, display_name, did, verification_method, key_reference)
      VALUES ($1,'Reserved','Reserved','did:web:verifiable.sg',
        'did:web:verifiable.sg#profile-key','FTA_SIGNING_KEY')`,
    [issuerA]
  ), /violates check constraint/);
  await assert.rejects(db.query(
    `INSERT INTO issuer_profiles
      (owner_issuer_id, issuer_name, display_name, did, verification_method, key_reference)
      VALUES ($1,'Invalid','Invalid','did:web:fta.verifiable.sg:issuer',
        'did:web:fta.verifiable.sg:issuer#key-1','FTA_SIGNING_KEY')`,
    [issuerA]
  ), /violates check constraint/);
  await assert.rejects(db.query(
    `INSERT INTO issuer_profiles
      (owner_issuer_id, issuer_name, display_name, did, verification_method, key_reference)
      VALUES ($1,'Invalid','Invalid','did:web:fta.verifiable.sg',
        'did:web:fta.verifiable.sg#key-1','secret-private-key')`,
    [issuerA]
  ), /violates check constraint/);

  await db.query("INSERT INTO templates (issuer_id, slug, name, issuer_profile_id) VALUES ($1,'fta','FTA', $2)",
    [issuerA, profile]);
  await assert.rejects(db.query(
    "INSERT INTO templates (issuer_id, slug, name, issuer_profile_id) VALUES ($1,'wrong','Wrong',$2)",
    [issuerB, profile]
  ), /violates foreign key constraint/);
  await db.query(
    `INSERT INTO credentials
      (issuer_id, issuer_profile_id, issuer_did, document_store_address, document_store_network, verification_method)
      VALUES ($1,$2,'did:web:fta.verifiable.sg','0x0000000000000000000000000000000000000001','sepolia',
        'did:web:fta.verifiable.sg#key-1')`,
    [issuerA, profile]
  );
  await assert.rejects(db.query(
    "INSERT INTO credentials (issuer_id, issuer_profile_id) VALUES ($1,$2)",
    [issuerB, profile]
  ), /violates foreign key constraint/);

  const columns = (await db.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'issuer_profiles'`
  )).rows.map((row) => row.column_name);
  assert.ok(columns.includes("key_reference"));
  assert.ok(!columns.some((column) => /private.?key/i.test(column)));
});
