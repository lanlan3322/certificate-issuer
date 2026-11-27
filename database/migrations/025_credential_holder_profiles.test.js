const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";

test("holder profiles are isolated and their owner and system fields cannot be reassigned", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY);
    CREATE TABLE public.credentials (id UUID PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
  `);
  await db.query("INSERT INTO auth.users VALUES ($1), ($2)", [first, second]);
  await db.exec(readFileSync(`${__dirname}/025_credential_holder_profiles.sql`, "utf8"));
  async function as(id, sql, args = []) {
    await db.exec("SET ROLE authenticated");
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
      return await db.query(sql, args);
    } finally {
      await db.exec("RESET ROLE");
    }
  }

  await as(first, "INSERT INTO credential_profiles (user_id, full_name, email) VALUES ($1, 'First', 'other@example.com')", [first]);
  await as(second, "INSERT INTO credential_profiles (user_id, full_name) VALUES ($1, 'Second')", [second]);
  assert.deepEqual((await as(first, "SELECT full_name FROM credential_profiles")).rows.map((row) => row.full_name), ["First"]);
  assert.equal((await as(first, "UPDATE credential_profiles SET full_name='Changed' WHERE user_id=$1 RETURNING id", [second])).rows.length, 0);
  await assert.rejects(as(first, "INSERT INTO credential_profiles (user_id) VALUES ($1)", [second]), /row-level security/);
  await assert.rejects(as(first, "UPDATE credential_profiles SET user_id=$1", [second]), /permission denied/);
  await assert.rejects(as(first, "UPDATE credential_profiles SET created_at=now()"), /permission denied/);
  await assert.rejects(as(first, "DELETE FROM credential_profiles"), /permission denied/);
  await assert.rejects(as(first, "SELECT * FROM wallet_audit_events"), /permission denied/);
  assert.equal((await db.query("SELECT count(*) FROM wallet_audit_events WHERE auth_user_id=$1 AND action='profile.updated'", [first])).rows[0].count, 1);
  await db.exec("SET ROLE anon");
  await assert.rejects(db.query("SELECT * FROM credential_profiles"), /permission denied/);
  await db.exec("RESET ROLE");
});
