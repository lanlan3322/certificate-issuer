const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const orgA = "00000000-0000-4000-8000-000000000001";
const orgB = "00000000-0000-4000-8000-000000000002";
const actor = "00000000-0000-4000-8000-000000000003";
const authId = "00000000-0000-4000-8000-000000000004";

test("issuer invitations are atomic, resumable, role-limited and tenant-bound", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE DOMAIN citext AS text;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
    CREATE TABLE organizations (id UUID PRIMARY KEY, status TEXT DEFAULT 'active');
    CREATE TABLE issuers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID REFERENCES organizations,
      name TEXT, slug TEXT UNIQUE, contact_email citext, did_uri TEXT, status TEXT DEFAULT 'active'
    );
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID REFERENCES organizations,
      auth_user_id UUID UNIQUE REFERENCES auth.users, email citext UNIQUE, display_name TEXT, roles TEXT[]
    );
    CREATE TABLE audit_logs (
      organization_id UUID, issuer_id UUID, user_id UUID, action TEXT, entity_type TEXT, entity_id UUID, metadata JSONB
    );
  `);
  await db.query("INSERT INTO organizations (id) VALUES ($1), ($2)", [orgA, orgB]);
  await db.query("INSERT INTO users (id,organization_id,email,roles) VALUES ($1,$2,'admin@example.com',ARRAY['issuer-admin'])", [actor, orgA]);
  await db.exec(readFileSync(`${__dirname}/012_issuer_user_invitations.sql`, "utf8"));
  const prepare = (org = orgA, role = "issuer-operator") => db.query(
    "SELECT prepare_issuer_invitation($1,'Academy','academy','new@example.com',$2,$3) AS result",
    [org, role, actor]
  );
  await assert.rejects(prepare(orgB), /not authorized/);
  await assert.rejects(prepare(orgA, "platform-admin"), /Invalid invitation role/);
  const first = (await prepare()).rows[0].result;
  const retry = (await prepare()).rows[0].result;
  assert.equal(first.issuer.id, retry.issuer.id);
  assert.equal(first.user_id, retry.user_id);
  await assert.rejects(prepare(orgA, "issuer-admin"), /already exists/);
  await db.query("INSERT INTO auth.users VALUES ($1,'wrong@example.com')", [authId]);
  await assert.rejects(db.query("SELECT complete_issuer_invitation($1,$2,$3)", [first.user_id, authId, actor]), /does not match/);
  await db.query("UPDATE auth.users SET email='new@example.com' WHERE id=$1", [authId]);
  await db.query("SELECT complete_issuer_invitation($1,$2,$3)", [first.user_id, authId, actor]);
  const profile = (await db.query("SELECT issuer_id, roles, auth_user_id FROM users WHERE id=$1", [first.user_id])).rows[0];
  assert.equal(profile.issuer_id, first.issuer.id);
  assert.deepEqual(profile.roles, ["issuer-operator"]);
  assert.equal(profile.auth_user_id, authId);
  await assert.rejects(prepare(), /already exists/);
  assert.equal((await db.query("SELECT count(*) FROM issuers")).rows[0].count, 1);
  assert.equal((await db.query("SELECT count(*) FROM audit_logs")).rows[0].count, 2);
  await assert.rejects(db.query("UPDATE users SET organization_id=$1 WHERE id=$2", [orgB, first.user_id]), /foreign key/);
  assert.equal((await db.query(
    "SELECT has_function_privilege('authenticated','prepare_issuer_invitation(uuid,text,text,text,text,uuid,text)','EXECUTE') AS allowed"
  )).rows[0].allowed, false);
  assert.equal((await db.query(
    "SELECT has_function_privilege('authenticated','complete_issuer_invitation(uuid,uuid,uuid)','EXECUTE') AS allowed"
  )).rows[0].allowed, false);
  await db.query("UPDATE issuers SET organization_id=$1 WHERE id=$2", [orgB, first.issuer.id]);
  assert.equal((await db.query("SELECT organization_id FROM users WHERE id=$1", [first.user_id])).rows[0].organization_id, orgB);
  const adminInvite = await db.query(
    "SELECT prepare_issuer_invitation($1,'Second Academy','second-academy','admin-new@example.com','issuer-admin',$2) AS result",
    [orgA, actor]
  );
  const adminUser = adminInvite.rows[0].result.user_id;
  assert.deepEqual((await db.query("SELECT roles FROM users WHERE id=$1", [adminUser])).rows[0].roles, ["issuer-admin"]);
});
