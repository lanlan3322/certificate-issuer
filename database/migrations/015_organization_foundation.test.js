const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function setup(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE DOMAIN citext AS text; CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
    $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
  `);
  for (const migration of ["001_initial_schema", "002_issuer_auth", "003_supabase_auth", "007_issuer_rls_policies", "012_issuer_user_invitations"]) {
    await db.exec(readFileSync(`${__dirname}/${migration}.sql`, "utf8").replace(/CREATE EXTENSION IF NOT EXISTS \w+;/g, ""));
  }
  await db.query("INSERT INTO organizations (id,name,slug) VALUES ($1,'A','org-a'),($2,'B','org-b')", [id(1), id(2)]);
  await db.query(`INSERT INTO issuers (id,organization_id,name,slug,contact_email)
    VALUES ($1,$2,'A issuer','issuer-a','a@example.com'),($3,$4,'B issuer','issuer-b','b@example.com')`, [id(11),id(1),id(12),id(2)]);
  for (const [n, role, org, issuer] of [[21,"platform-admin",1,11],[22,"issuer-admin",1,11],[23,"issuer-operator",1,11],[24,"verifier",1,11],[25,"issuer-operator",2,12]]) {
    await db.query("INSERT INTO auth.users VALUES ($1,$2)", [id(n),`${n}@example.com`]);
    await db.query("INSERT INTO users (id,auth_user_id,organization_id,issuer_id,email,display_name,roles) VALUES ($1,$1,$2,$3,$4,'User',ARRAY[$5])",
      [id(n),id(org),id(issuer),`${n}@example.com`,role]);
  }
  await db.query("INSERT INTO templates (id,issuer_id,slug,name) VALUES ($1,$2,'classic','A'),($3,$4,'classic','B'),($5,NULL,'legacy','Legacy')",
    [id(31),id(11),id(32),id(12),id(33)]);
  await db.query(`INSERT INTO credentials (id,issuer_id,template_id,external_id,recipient_name,recipient_email,credential)
    VALUES ($1,$2,$3,'legacy-certificate','Recipient','r@example.com','{"proof":{"proofValue":"unchanged"}}'),
           ($4,$5,$6,'other-certificate','Other','o@example.com','{"proof":{"proofValue":"other"}}')`,
    [id(41),id(11),id(31),id(42),id(12),id(32)]);
  const signedBytes = '{ "proof": { "proofValue": "unchanged" }, "id": "legacy" }\n';
  await db.query("UPDATE credentials SET credential=$1::jsonb WHERE id=$2", [JSON.stringify(signedBytes), id(41)]);
  await db.exec(readFileSync(`${__dirname}/015_organization_foundation.sql`, "utf8"));
  await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated; REVOKE UPDATE,DELETE ON users FROM authenticated; REVOKE DELETE ON organizations FROM authenticated;");
  async function as(n, query, params = []) {
    await db.exec("SET ROLE authenticated");
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
      return await db.query(query, params);
    } finally { await db.exec("RESET ROLE"); }
  }
  return { db, as, signedBytes };
}

test("migration preserves signed credentials and existing tenants, and assigns legacy unowned templates", async (t) => {
  const { db, signedBytes } = await setup(t);
  assert.equal((await db.query("SELECT count(*) FROM credentials")).rows[0].count, 2);
  assert.equal((await db.query("SELECT credential FROM credentials WHERE id=$1",[id(41)])).rows[0].credential,signedBytes);
  assert.equal((await db.query("SELECT organization_id FROM credentials WHERE id=$1",[id(41)])).rows[0].organization_id,id(1));
  const fallback = (await db.query("SELECT id FROM organizations WHERE slug='verifiable-sg'")).rows[0].id;
  assert.equal((await db.query("SELECT organization_id FROM templates WHERE id=$1",[id(33)])).rows[0].organization_id,fallback);
  assert.equal((await db.query("SELECT role FROM organization_members WHERE user_id=$1",[id(22)])).rows[0].role,"organization_admin");
});

test("membership-based invitation RPCs reject downgraded legacy admins and audit new memberships", async (t) => {
  const { db, as } = await setup(t);
  await as(21,"UPDATE organization_members SET role='viewer' WHERE user_id=$1",[id(22)]);
  const args = [id(1),"New Issuer","new-issuer","new@example.com","issuer",id(22)];
  await assert.rejects(db.query("SELECT prepare_issuer_invitation($1,$2,$3,$4,$5,$6)", args), /not authorized/);
  await as(21,"UPDATE organization_members SET role='organization_admin' WHERE user_id=$1",[id(22)]);
  const invited = (await db.query("SELECT prepare_issuer_invitation($1,$2,$3,$4,$5,$6) AS result",args)).rows[0].result;
  const retryArgs = [...args];
  retryArgs[4] = "issuer-operator";
  const retried = (await db.query("SELECT prepare_issuer_invitation($1,$2,$3,$4,$5,$6) AS result",retryArgs)).rows[0].result;
  assert.equal(retried.user_id, invited.user_id);
  assert.equal((await db.query("SELECT role FROM organization_members WHERE user_id=$1",[invited.user_id])).rows[0].role,"issuer");
  assert.equal((await db.query("SELECT count(*) FROM audit_logs WHERE user_id=$1 AND action='organization.member.added'",[id(22)])).rows[0].count,1);
  await as(21,"UPDATE organizations SET status='disabled' WHERE id=$1",[id(1)]);
  await assert.rejects(db.query("SELECT prepare_issuer_invitation($1,$2,$3,$4,$5,$6)",args), /Active organization/);
});

test("global role management cannot be invoked by organization admins or remove the last administrator", async (t) => {
  const { as } = await setup(t);
  await assert.rejects(as(22,"SELECT phase1_set_platform_admin($1,true)",[id(24)]), /permission required/);
  await assert.rejects(as(21,"SELECT phase1_set_platform_admin($1,false)",[id(21)]), /last platform administrator/);
  await assert.rejects(as(21,"SELECT phase1_set_platform_admin($1,NULL)",[id(21)]), /boolean is required/);
  await as(21,"SELECT phase1_set_platform_admin($1,true)",[id(24)]);
  assert.equal((await as(24,"SELECT count(*) FROM credentials")).rows[0].count,2);
  await as(24,"SELECT phase1_set_platform_admin($1,false)",[id(21)]);
  assert.equal((await as(21,"SELECT count(*) FROM credentials")).rows[0].count,1);
});

test("RLS isolates organizations and enforces viewer, issuer, organization admin and platform admin permissions", async (t) => {
  const { as } = await setup(t);
  for (const table of ["issuers","templates","credentials"]) {
    const records = (await as(24,`SELECT organization_id FROM ${table}`)).rows;
    assert.ok(records.length);
    assert.ok(records.every((row) => row.organization_id === id(1)));
  }
  assert.equal((await as(21,"SELECT count(*) FROM organizations")).rows[0].count,3);
  assert.equal((await as(21,"SELECT count(*) FROM credentials")).rows[0].count,2);
  await assert.rejects(as(23,"INSERT INTO templates (issuer_id,slug,name) VALUES ($1,'bad','Bad')",[id(11)]), /row-level security/);
  await assert.rejects(as(24,"INSERT INTO credentials (issuer_id,external_id,recipient_name,recipient_email,credential) VALUES ($1,'bad','Bad','b@example.com','{}')",[id(11)]), /row-level security/);
  await assert.rejects(as(23,"INSERT INTO organizations (name,display_name,slug,created_by) VALUES ('Bad','Bad','bad',$1)",[id(23)]), /row-level security/);
  await as(22,"INSERT INTO templates (issuer_id,slug,name) VALUES ($1,'new-template','New')",[id(11)]);
  assert.equal((await as(24,"UPDATE templates SET name='Tampered' RETURNING id")).rows.length,0);
  await as(23,"INSERT INTO credentials (issuer_id,external_id,recipient_name,recipient_email,credential) VALUES ($1,'new','Recipient','r@example.com','{}')",[id(11)]);
  await assert.rejects(as(23,"INSERT INTO credentials (issuer_id,external_id,recipient_name,recipient_email,credential) VALUES ($1,'foreign','Recipient','r@example.com','{}')",[id(12)]), /Issuer not found|row-level security/);
});

test("organization creation does not move its creator and audits organization/member changes transactionally", async (t) => {
  const { as, db } = await setup(t);
  const organization = (await as(21,`INSERT INTO organizations (name,display_name,slug,created_by)
    VALUES ('New','New Organization','new-org',$1) RETURNING id`,[id(21)])).rows[0];
  assert.equal((await db.query("SELECT organization_id FROM users WHERE id=$1",[id(21)])).rows[0].organization_id,id(1));
  await as(21,"UPDATE organizations SET display_name='Updated' WHERE id=$1",[organization.id]);
  await as(21,"INSERT INTO organization_members (organization_id,user_id,role) VALUES ($1,$2,'viewer')",[organization.id,id(24)]);
  await as(21,"DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2",[organization.id,id(24)]);
  const actions = (await db.query("SELECT action,user_id,entity_id,created_at FROM audit_logs WHERE organization_id=$1 ORDER BY created_at",[organization.id])).rows;
  assert.deepEqual(actions.map((row) => row.action),["organization.created","organization.updated","organization.member.added","organization.member.removed"]);
  assert.ok(actions.every((row) => row.user_id === id(21) && row.entity_id && row.created_at));
});

test("membership removal, role downgrades and organization deactivation revoke existing-session access", async (t) => {
  const { as } = await setup(t);
  await as(22,"UPDATE organization_members SET role='viewer' WHERE user_id=$1",[id(23)]);
  await assert.rejects(as(23,"INSERT INTO templates (issuer_id,slug,name) VALUES ($1,'no','No')",[id(11)]), /row-level security/);
  await as(22,"DELETE FROM organization_members WHERE user_id=$1",[id(24)]);
  assert.equal((await as(24,"SELECT count(*) FROM credentials")).rows[0].count,0);
  await as(21,"UPDATE organizations SET status='disabled' WHERE id=$1",[id(1)]);
  assert.equal((await as(23,"SELECT count(*) FROM credentials")).rows[0].count,0);
  assert.equal((await as(21,"SELECT count(*) FROM credentials")).rows[0].count,2);
});

test("ownership mismatch, membership spoofing and cross-organization template use fail closed", async (t) => {
  const { as, db } = await setup(t);
  await assert.rejects(as(22,"UPDATE organization_members SET role='platform_admin' WHERE user_id=$1",[id(24)]), /check constraint/);
  await assert.rejects(as(22,"UPDATE organization_members SET organization_id=$1 WHERE user_id=$2",[id(2),id(24)]), /cannot be reassigned/);
  await assert.rejects(as(23,`INSERT INTO credentials (issuer_id,organization_id,external_id,recipient_name,recipient_email,credential)
    VALUES ($1,$2,'mismatch','R','r@example.com','{}')`,[id(11),id(2)]), /must match issuer/);
  await assert.rejects(as(23,`INSERT INTO credentials (issuer_id,template_id,external_id,recipient_name,recipient_email,credential)
    VALUES ($1,$2,'foreign-template','R','r@example.com','{}')`,[id(11),id(32)]), /must belong/);
  await assert.rejects(db.query("UPDATE issuers SET organization_id=$1 WHERE id=$2",[id(2),id(11)]), /transfers are not supported/);
});

test("audit failure rolls back organization creation instead of returning an unaudited success", async (t) => {
  const { db, as } = await setup(t);
  await db.exec("ALTER TABLE audit_logs ADD CONSTRAINT fixture_audit_failure CHECK (action <> 'organization.created')");
  await assert.rejects(as(21,`INSERT INTO organizations (name,display_name,slug,created_by)
    VALUES ('Must rollback','Must rollback','must-rollback',$1)`,[id(21)]), /fixture_audit_failure/);
  assert.equal((await db.query("SELECT count(*) FROM organizations WHERE slug='must-rollback'")).rows[0].count,0);
});
