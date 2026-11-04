const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const migration = readFileSync(`${__dirname}/014_rename_fta_academy_to_fintech_academy.sql`, "utf8");

test("renames existing FTA template and issuer-profile display names idempotently", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE issuer_profiles (
      id UUID PRIMARY KEY,
      issuer_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      did TEXT NOT NULL,
      key_reference TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE templates (
      id UUID PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      definition JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE credentials (id UUID PRIMARY KEY, credential JSONB NOT NULL);
  `);
  await db.query(`
    INSERT INTO issuer_profiles (id, issuer_name, display_name, did, key_reference) VALUES
      ('00000000-0000-4000-8000-000000000001', 'FTA Academy', 'FTA Academy',
        'did:web:fta.verifiable.sg', 'FTA_SIGNING_KEY'),
      ('00000000-0000-4000-8000-000000000002', 'Custom Issuer', 'FTA Academy',
        'did:web:custom.verifiable.sg', 'CUSTOM_SIGNING_KEY'),
      ('00000000-0000-4000-8000-000000000003', 'Other Academy', 'Other Academy',
        'did:web:other.verifiable.sg', 'OTHER_SIGNING_KEY')
  `);
  await db.query(`
    INSERT INTO templates (id, slug, name, definition) VALUES
      ('00000000-0000-4000-8000-000000000004', 'fta', 'FTA Academy',
        '{"name":"FTA Academy","renderer":"fta","organizationName":"Fintech Academy"}'),
      ('00000000-0000-4000-8000-000000000005', 'fta', 'Customized Template',
        '{"name":"Customized Template","renderer":"fta"}'),
      ('00000000-0000-4000-8000-000000000006', 'modern', 'FTA Academy',
        '{"name":"FTA Academy","renderer":"modern"}')
  `);
  await db.query("INSERT INTO credentials VALUES ($1, $2)", [
    "00000000-0000-4000-8000-000000000007",
    JSON.stringify({ credentialSubject: { issuerDisplayName: "FTA Academy" } }),
  ]);
  const originalCredential = (await db.query("SELECT * FROM credentials")).rows;

  await db.exec(migration);
  const profiles = (await db.query("SELECT * FROM issuer_profiles ORDER BY id")).rows;
  assert.deepEqual(
    profiles.map(({ issuer_name, display_name }) => [issuer_name, display_name]),
    [
      ["Fintech Academy", "Fintech Academy"],
      ["Custom Issuer", "Fintech Academy"],
      ["Other Academy", "Other Academy"],
    ]
  );
  assert.equal(profiles[0].did, "did:web:fta.verifiable.sg");
  assert.equal(profiles[0].key_reference, "FTA_SIGNING_KEY");
  const templates = (await db.query("SELECT * FROM templates ORDER BY id")).rows;
  assert.equal(templates[0].name, "Fintech Academy");
  assert.equal(templates[0].definition.name, "Fintech Academy");
  assert.equal(templates[0].definition.renderer, "fta");
  assert.equal(templates[1].name, "Customized Template");
  assert.deepEqual(templates[1].definition, { name: "Customized Template", renderer: "fta" });
  assert.equal(templates[2].name, "FTA Academy");
  assert.deepEqual((await db.query("SELECT * FROM credentials")).rows, originalCredential);

  await db.exec(migration);
  assert.deepEqual((await db.query("SELECT * FROM issuer_profiles ORDER BY id")).rows, profiles);
  assert.deepEqual((await db.query("SELECT * FROM templates ORDER BY id")).rows, templates);
});
