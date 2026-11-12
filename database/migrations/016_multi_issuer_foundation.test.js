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
  for (const migration of ["001_initial_schema","002_issuer_auth","003_supabase_auth","004_supabase_api_only",
    "006_bitstring_status","007_issuer_rls_policies","008_multi_issuer_profiles","009_profile_status_lists",
    "010_issuer_profile_identity_lock","011_security_boundary_hardening","012_issuer_user_invitations"]) {
    await db.exec(readFileSync(`${__dirname}/${migration}.sql`, "utf8").replace(/CREATE EXTENSION IF NOT EXISTS \w+;/g, ""));
  }
  await db.query("INSERT INTO organizations (id,name,slug) VALUES ($1,'A','org-a'),($2,'B','org-b')", [id(1),id(2)]);
  await db.query(`INSERT INTO issuers (id,organization_id,name,slug,contact_email) VALUES
    ($1,$2,'A issuer','issuer-a','a@example.com'),($3,$2,'A sibling','sibling-a','s@example.com'),
    ($4,$5,'B issuer','issuer-b','b@example.com')`,[id(11),id(1),id(12),id(13),id(2)]);
  for (const [n,role,org,issuer] of [
    [21,"platform-admin",1,11],[22,"issuer-admin",1,11],[23,"issuer-operator",1,11],
    [24,"verifier",1,11],[25,"issuer-operator",2,13],[26,"verifier",1,null],[27,"verifier",1,12],
  ]) {
    await db.query("INSERT INTO auth.users VALUES ($1,$2)",[id(n),`${n}@example.com`]);
    await db.query("INSERT INTO users (id,auth_user_id,organization_id,issuer_id,email,display_name,roles) VALUES ($1,$1,$2,$3,$4,'User',ARRAY[$5])",
      [id(n),id(org),issuer ? id(issuer) : null,`${n}@example.com`,role]);
  }
  await db.query(`INSERT INTO templates (id,issuer_id,slug,name) VALUES
    ($1,$2,'classic','A'),($3,$4,'classic','Sibling'),($5,$6,'classic','B'),($7,NULL,'global','Legacy global')`,
    [id(31),id(11),id(32),id(12),id(33),id(13),id(34)]);
  const bytes = '{ "proof": { "proofValue": "keep-exact" }, "issuer": "did:web:legacy.test" }\n';
  await db.query(`INSERT INTO credentials (id,issuer_id,template_id,external_id,recipient_name,recipient_email,credential) VALUES
    ($1,$2,$3,'legacy','Recipient','r@example.com',$4::jsonb),
    ($5,$6,NULL,'missing-template','Recipient','r@example.com','{}'),
    ($7,$2,$8,'legacy-shared','Recipient','r@example.com','{}')`,
    [id(41),id(11),id(31),JSON.stringify(bytes),id(42),id(13),id(43),id(32)]);
  await db.exec(readFileSync(`${__dirname}/015_organization_foundation.sql`, "utf8"));
  await db.exec(readFileSync(`${__dirname}/016_multi_issuer_foundation.sql`, "utf8"));
  await db.exec("GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated");
  async function as(n,sql,params=[]) {
    await db.exec("SET ROLE authenticated");
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(n)]);
      return await db.query(sql,params);
    } finally { await db.exec("RESET ROLE"); }
  }
  return {db,as,bytes};
}

test("Phase 2 preserves signed bytes, tenant IDs and historical shared templates; backfills missing ownership",async(t)=>{
  const {db,bytes}=await setup(t);
  const rows=(await db.query("SELECT * FROM credentials ORDER BY external_id")).rows;
  assert.equal(rows.length,3);
  assert.equal(rows.find(r=>r.id===id(41)).credential,bytes);
  assert.equal(rows.find(r=>r.id===id(43)).template_id,id(32));
  assert.equal(rows.find(r=>r.id===id(41)).organization_id,id(1));
  assert.ok(rows.every(r=>r.template_id && r.issuer_snapshot.issuerId===r.issuer_id));
  const fallback=(await db.query("SELECT i.name FROM templates t JOIN issuers i ON i.id=t.issuer_id WHERE t.id=$1",[id(34)])).rows[0];
  assert.equal(fallback.name,"Verifiable.sg Main Issuer");
});

test("Phase 2 RLS isolates sibling issuers and tenants while admins retain intended visibility",async(t)=>{
  const {as}=await setup(t);
  for (const table of ["issuers","templates","credentials"]) {
    const records=(await as(23,`SELECT * FROM ${table}`)).rows;
    assert.ok(records.length);
    assert.ok(records.every(r=>(table==="issuers"?r.id:r.issuer_id)===id(11)));
  }
  assert.equal((await as(22,"SELECT count(*) FROM issuers")).rows[0].count,2);
  assert.equal((await as(21,"SELECT count(*) FROM issuers")).rows[0].count,4);
  assert.equal((await as(24,"SELECT count(*) FROM issuers")).rows[0].count,1);
  assert.equal((await as(26,"SELECT count(*) FROM issuers")).rows[0].count,2);
});

test("Phase 2 issuer creation, editing, tenant-local codes and platform-only soft deletion",async(t)=>{
  const {as,db}=await setup(t);
  const sql="INSERT INTO issuers (organization_id,name,display_name,slug,contact_email) VALUES ($1,'New','New','new-code','n@example.com') RETURNING id";
  const created=(await as(22,sql,[id(1)])).rows[0];
  await as(21,sql,[id(2)]);
  await assert.rejects(as(22,sql,[id(1)]),/duplicate key/);
  await assert.rejects(as(22,sql.replace("new-code","foreign"),[id(2)]),/row-level security|Active organization/);
  await assert.rejects(as(23,sql.replace("new-code","operator"),[id(1)]),/row-level security/);
  await as(22,"UPDATE issuers SET display_name='Edited',status='inactive' WHERE id=$1",[created.id]);
  assert.equal((await db.query("SELECT active FROM issuers WHERE id=$1",[created.id])).rows[0].active,false);
  await assert.rejects(as(22,"UPDATE issuers SET status='deleted' WHERE id=$1",[created.id]),/Only platform/);
  await as(21,"UPDATE issuers SET status='deleted' WHERE id=$1",[created.id]);
  await assert.rejects(as(21,"UPDATE issuers SET status='active' WHERE id=$1",[created.id]),/immutable/);
});

test("Phase 2 issuer membership roles, removal and cross-organization assignment",async(t)=>{
  const {as}=await setup(t);
  await as(22,"UPDATE issuer_members SET role='issuer_admin' WHERE issuer_id=$1 AND user_id=$2",[id(12),id(27)]);
  await as(27,"INSERT INTO templates (issuer_id,slug,name) VALUES ($1,'assigned','Assigned')",[id(12)]);
  await assert.rejects(as(27,"INSERT INTO templates (issuer_id,slug,name) VALUES ($1,'other','Other')",[id(11)]),/row-level security|Issuer not found/);
  await assert.rejects(as(22,"INSERT INTO issuer_members (issuer_id,user_id,role) VALUES ($1,$2,'issuer_operator')",[id(11),id(25)]),/same organization/);
  await assert.rejects(as(23,"UPDATE issuer_members SET role='issuer_admin' RETURNING *").then(r=>{if(!r.rows.length)throw Error("denied")}),/denied/);
  await as(22,"DELETE FROM issuer_members WHERE issuer_id=$1 AND user_id=$2",[id(11),id(23)]);
  assert.equal((await as(23,"SELECT count(*) FROM credentials")).rows[0].count,0);
  assert.equal((await as(23,"SELECT phase2_issuer_access($1,'operate') AS allowed",[id(11)])).rows[0].allowed,false);
});

test("Phase 2 issuance requires template-derived owner; snapshots are immutable and writes audited atomically",async(t)=>{
  const {as,db}=await setup(t);
  const sql="INSERT INTO credentials (issuer_id,template_id,external_id,recipient_name,recipient_email,credential) VALUES ($1,$2,$3,'R','r@example.com','{}') RETURNING id,issuer_snapshot";
  const record=(await as(23,sql,[id(11),id(31),"new"])).rows[0];
  assert.equal(record.issuer_snapshot.issuerDisplayName,"A issuer");
  await as(22,"UPDATE issuers SET display_name='Changed' WHERE id=$1",[id(11)]);
  assert.equal((await as(23,"SELECT issuer_snapshot FROM credentials WHERE id=$1",[record.id])).rows[0].issuer_snapshot.issuerDisplayName,"A issuer");
  await assert.rejects(as(23,sql,[id(11),id(32),"sibling-template"]),/must belong/);
  await assert.rejects(as(21,sql,[id(11),id(33),"foreign-template"]),/must belong/);
  await assert.rejects(as(24,sql,[id(11),id(31),"viewer"]),/row-level security/);
  await assert.rejects(as(23,"UPDATE credentials SET issuer_snapshot='{}' WHERE id=$1",[record.id]),/immutable/);
  await assert.rejects(as(23,"UPDATE credentials SET credential='{}',external_id='tampered' WHERE id=$1",[id(41)]),/immutable/);
  await as(23,"INSERT INTO revocations (credential_id,issuer_id,action,reason) VALUES ($1,$2,'revoke','Test')",[record.id,id(11)]);
  await as(23,"UPDATE credentials SET status='revoked' WHERE id=$1",[record.id]);
  await as(22,"UPDATE issuers SET status='suspended' WHERE id=$1",[id(11)]);
  await assert.rejects(as(23,sql,[id(11),id(31),"suspended"]),/Active issuer/);
  assert.equal((await db.query("SELECT count(*) FROM audit_logs WHERE entity_id=$1 AND action='credential.issued_by_issuer'",[record.id])).rows[0].count,1);
  assert.ok((await db.query("SELECT count(*) FROM audit_logs WHERE action='issuer.edited'")).rows[0].count>0);
});

test("organization admin issuance migration allows own issuers without granting revocation", async(t)=>{
  const {as,db}=await setup(t);
  await db.exec(readFileSync(`${__dirname}/023_organization_admin_issuance.sql`, "utf8"));
  const insert="INSERT INTO credentials (issuer_id,template_id,external_id,recipient_name,recipient_email,credential) VALUES ($1,$2,$3,'R','r@example.com','{}') RETURNING id";
  for (const [owner, template] of [[id(11),id(31)],[id(12),id(32)]]) {
    assert.ok((await as(22,insert,[owner,template,`admin-${owner}`])).rows[0].id);
  }
  await assert.rejects(as(22,insert,[id(13),id(33),"foreign-admin"]),/row-level security|Issuer not found/);
  await assert.rejects(as(24,insert,[id(11),id(31),"viewer-admin"]),/row-level security/);
  const changed=await as(22,"UPDATE credentials SET status='revoked' WHERE id=$1 RETURNING id",[id(41)]);
  assert.equal(changed.rows.length,0);
  await assert.rejects(as(22,"INSERT INTO revocations (credential_id,issuer_id,action,reason) VALUES ($1,$2,'revoke','Test')",[id(41),id(11)]),/row-level security/);
  await as(22,"UPDATE issuers SET status='suspended' WHERE id=$1",[id(12)]);
  await assert.rejects(as(22,insert,[id(12),id(32),"suspended-admin"]),/Active issuer|row-level security/);
});

test("organization admin credential operations remain tenant-scoped and require active issuers", async(t)=>{
  const {as,db}=await setup(t);
  for (const migration of ["023_organization_admin_issuance","024_organization_admin_credential_operations"]) {
    await db.exec(readFileSync(`${__dirname}/${migration}.sql`, "utf8"));
  }
  const sibling=(await as(22,"INSERT INTO credentials (issuer_id,template_id,external_id,recipient_name,recipient_email,credential) VALUES ($1,$2,'sibling-admin','R','r@example.com','{}') RETURNING id",[id(12),id(32)])).rows[0].id;
  for (const [credential, owner] of [[id(41),id(11)],[sibling,id(12)]]) {
    await as(22,"INSERT INTO revocations (credential_id,issuer_id,action,reason) VALUES ($1,$2,'revoke','Test')",[credential,owner]);
    assert.equal((await as(22,"UPDATE credentials SET status='revoked' WHERE id=$1 RETURNING id",[credential])).rows.length,1);
  }
  assert.equal((await as(22,"UPDATE credentials SET status='revoked' WHERE id=$1 RETURNING id",[id(42)])).rows.length,0);
  await assert.rejects(as(22,"INSERT INTO revocations (credential_id,issuer_id,action,reason) VALUES ($1,$2,'revoke','Test')",[id(42),id(13)]),/row-level security/);
  await assert.rejects(as(22,"INSERT INTO revocations (credential_id,issuer_id,action,reason) VALUES ($1,$2,'revoke','Test')",[id(41),id(12)]),/row-level security/);
  assert.equal((await as(24,"UPDATE credentials SET status='revoked' WHERE id=$1 RETURNING id",[id(41)])).rows.length,0);
  await as(22,"UPDATE issuers SET status='suspended' WHERE id=$1",[id(11)]);
  assert.equal((await as(22,"UPDATE credentials SET status='issued' WHERE id=$1 RETURNING id",[id(41)])).rows.length,0);
  await assert.rejects(as(22,"INSERT INTO revocations (credential_id,issuer_id,action,reason) VALUES ($1,$2,'suspend','Test')",[id(41),id(11)]),/row-level security/);
});

test("Phase 2 audit failure rolls back issuer edits; legacy invitations still assign issuer access",async(t)=>{
  const {as,db}=await setup(t);
  await db.exec("ALTER TABLE audit_logs ADD CONSTRAINT reject_issuer_edit CHECK (action <> 'issuer.edited') NOT VALID");
  await assert.rejects(as(22,"UPDATE issuers SET display_name='Not saved' WHERE id=$1",[id(11)]),/reject_issuer_edit/);
  assert.equal((await db.query("SELECT display_name FROM issuers WHERE id=$1",[id(11)])).rows[0].display_name,"A issuer");
  const result=(await db.query("SELECT prepare_issuer_invitation($1,'Invited','invited','invite@example.com','issuer',$2) AS result",[id(1),id(22)])).rows[0].result;
  assert.equal(result.issuer.display_name,"Invited");
  assert.equal((await db.query("SELECT role FROM issuer_members WHERE issuer_id=$1 AND user_id=$2",[result.issuer.id,result.user_id])).rows[0].role,"issuer_operator");
});
