const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

test("security hardening revokes self-edits of authorization data and public rate-limit RPC access", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE users (id UUID PRIMARY KEY, roles TEXT[] NOT NULL, organization_id UUID NOT NULL);
    CREATE POLICY users_self_update ON users FOR UPDATE USING (true);
    GRANT UPDATE ON users TO anon, authenticated;
    CREATE TABLE auth_rate_limits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket TEXT NOT NULL,
      identifier TEXT NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE FUNCTION enforce_auth_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
      RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT true $$;
    GRANT EXECUTE ON FUNCTION enforce_auth_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
      TO anon, authenticated;
  `);

  await db.exec(readFileSync(`${__dirname}/011_security_boundary_hardening.sql`, "utf8"));

  assert.equal(await db.query(
    "SELECT has_table_privilege('authenticated', 'public.users', 'UPDATE') AS allowed"
  ).then(({ rows }) => rows[0].allowed), false);
  assert.equal(await db.query(
    "SELECT has_table_privilege('anon', 'public.users', 'UPDATE') AS allowed"
  ).then(({ rows }) => rows[0].allowed), false);
  assert.equal(await db.query(
    "SELECT has_function_privilege('anon', 'public.enforce_auth_rate_limit(text,text,integer,integer)', 'EXECUTE') AS allowed"
  ).then(({ rows }) => rows[0].allowed), false);
  assert.equal(await db.query(
    "SELECT has_function_privilege('authenticated', 'public.enforce_auth_rate_limit(text,text,integer,integer)', 'EXECUTE') AS allowed"
  ).then(({ rows }) => rows[0].allowed), false);
  assert.equal(await db.query(
    "SELECT has_function_privilege('service_role', 'public.enforce_auth_rate_limit(text,text,integer,integer)', 'EXECUTE') AS allowed"
  ).then(({ rows }) => rows[0].allowed), true);
  assert.equal((await db.query(
    "SELECT count(*) AS count FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_self_update'"
  )).rows[0].count, 0);
});
