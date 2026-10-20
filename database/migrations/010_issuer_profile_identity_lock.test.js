const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

test("used issuer profiles retain the DID and signing-key identity", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE issuer_profiles (
      id UUID PRIMARY KEY,
      did TEXT NOT NULL,
      verification_method TEXT NOT NULL,
      key_reference TEXT NOT NULL,
      display_name TEXT NOT NULL
    );
    CREATE TABLE credentials (
      id UUID PRIMARY KEY,
      issuer_profile_id UUID REFERENCES issuer_profiles(id)
    );
    CREATE TABLE bitstring_status_allocations (
      allocation BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      issuer_profile_id UUID REFERENCES issuer_profiles(id)
    );
  `);
  await db.exec(readFileSync(`${__dirname}/010_issuer_profile_identity_lock.sql`, "utf8"));

  const used = "00000000-0000-4000-8000-000000000001";
  const reserved = "00000000-0000-4000-8000-000000000002";
  const unused = "00000000-0000-4000-8000-000000000003";
  await db.query(
    `INSERT INTO issuer_profiles VALUES
      ($1,'did:web:used.example','did:web:used.example#key-1','USED_KEY','Used'),
      ($2,'did:web:reserved.example','did:web:reserved.example#key-1','RESERVED_KEY','Reserved'),
      ($3,'did:web:unused.example','did:web:unused.example#key-1','UNUSED_KEY','Unused')`,
    [used, reserved, unused]
  );
  await db.query("INSERT INTO credentials VALUES ($1,$2)", [
    "00000000-0000-4000-8000-000000000011", used,
  ]);
  await db.query("INSERT INTO bitstring_status_allocations (issuer_profile_id) VALUES ($1)", [reserved]);

  await assert.rejects(
    db.query("UPDATE issuer_profiles SET did='did:web:new.example' WHERE id=$1", [used]),
    /Issuer profile identity is immutable after first use/
  );
  await assert.rejects(
    db.query("UPDATE issuer_profiles SET verification_method='did:web:reserved.example#key-2' WHERE id=$1", [reserved]),
    /Issuer profile identity is immutable after first use/
  );
  await assert.rejects(
    db.query("UPDATE issuer_profiles SET key_reference='NEW_KEY' WHERE id=$1", [used]),
    /Issuer profile identity is immutable after first use/
  );

  await db.query(
    "UPDATE issuer_profiles SET display_name='Renamed', did='did:web:unused-new.example' WHERE id=$1",
    [unused]
  );
  await db.query("UPDATE issuer_profiles SET display_name='Updated label' WHERE id=$1", [used]);
  const result = await db.query("SELECT display_name FROM issuer_profiles WHERE id=$1", [used]);
  assert.equal(result.rows[0].display_name, "Updated label");
});
