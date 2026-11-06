const test = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {PGlite}=require("@electric-sql/pglite");
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const key=(version=1)=>({
  publicKey:"-----BEGIN PUBLIC KEY-----\npublic\n-----END PUBLIC KEY-----",
  publicKeyMultibase:"zpublic",fingerprint:`SHA256:fingerprint-${version}`,encryptionKeyId:"v1",
  keyVersion:version,encryptedPrivateKey:JSON.stringify({v:1,iv:"a".repeat(16),tag:"a".repeat(24),data:"ciphertext"}),
});
const input=(n=50,org=1)=>({id:id(n),organizationId:id(org),name:`Issuer ${n}`,slug:`issuer-${n}`,contactEmail:`issuer${n}@example.com`});

async function setup(t) {
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
    CREATE DOMAIN citext AS text;CREATE SCHEMA auth;CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`);
  for(const file of ["001_initial_schema","002_issuer_auth","003_supabase_auth","004_supabase_api_only",
    "006_bitstring_status","007_issuer_rls_policies","008_multi_issuer_profiles","009_profile_status_lists",
    "010_issuer_profile_identity_lock","011_security_boundary_hardening","012_issuer_user_invitations"]) {
    await db.exec(readFileSync(`${__dirname}/${file}.sql`,"utf8").replace(/CREATE EXTENSION IF NOT EXISTS \w+;/g,""));
  }
  await db.query("INSERT INTO organizations(id,name,slug) VALUES($1,'A','a'),($2,'B','b')",[id(1),id(2)]);
  await db.query(`INSERT INTO issuers(id,organization_id,name,slug,contact_email) VALUES
    ($1,$2,'A legacy','legacy-a','a@example.com'),($3,$4,'B legacy','legacy-b','b@example.com')`,[id(11),id(1),id(12),id(2)]);
  for(const [n,role] of [[21,"platform-admin"],[22,"issuer-admin"],[23,"issuer-operator"],[24,"verifier"]]) {
    await db.query("INSERT INTO auth.users VALUES($1,$2)",[id(n),`${n}@example.com`]);
    await db.query(`INSERT INTO users(id,auth_user_id,organization_id,issuer_id,email,display_name,roles)
      VALUES($1,$1,$2,$3,$4,'User',ARRAY[$5])`,[id(n),id(1),id(11),`${n}@example.com`,role]);
  }
  await db.query("INSERT INTO templates(id,issuer_id,slug,name) VALUES($1,$2,'legacy-template','Legacy template')",[id(31),id(11)]);
  await db.query(`INSERT INTO credentials(id,issuer_id,template_id,external_id,recipient_name,recipient_email,credential,issuer_did,verification_method)
    VALUES($1,$2,$3,'legacy-credential','Recipient','recipient@example.com',$4::jsonb,'did:web:legacy.example','did:web:legacy.example#key-1')`,
    [id(41),id(11),id(31),JSON.stringify('{ "issuer": "did:web:legacy.example", "proof": { "proofValue": "keep-exact" } }\n')]);
  await db.exec(readFileSync(`${__dirname}/015_organization_foundation.sql`,"utf8"));
  await db.exec(readFileSync(`${__dirname}/016_multi_issuer_foundation.sql`,"utf8"));
  const before=await db.query("SELECT id,credential FROM credentials ORDER BY id");
  await db.exec(readFileSync(`${__dirname}/017_issuer_key_management.sql`,"utf8"));
  assert.deepEqual((await db.query("SELECT id,credential FROM credentials ORDER BY id")).rows,before.rows);
  const create=(n=50,actor=22,org=1,extra={})=>db.query(
    "SELECT phase3_create_issuer($1::jsonb,$2::jsonb,$3,$4) AS issuer",
    [JSON.stringify({...input(n,org),...extra}),JSON.stringify(key()),id(actor),"192.0.2.1"]);
  const save=(n,actor,version=2,imported=false,extra={})=>db.query(
    "SELECT phase3_save_key($1,$2::jsonb,$3,NULL,$4) AS id",
    [id(n),JSON.stringify({...key(version),...extra}),id(actor),imported]);
  return {db,create,save};
}

test("issuer creation is atomic, encrypted, audited and cross-tenant authorized",async t=>{
  const {db,create}=await setup(t);
  await create();
  const row=(await db.query("SELECT * FROM issuer_keys WHERE issuer_id=$1",[id(50)])).rows[0];
  assert.equal(row.status,"pending");assert.equal(row.created_by,id(22));assert.equal(row.key_version,1);
  assert.equal((await db.query("SELECT created_by FROM issuers WHERE id=$1",[id(50)])).rows[0].created_by,id(22));
  assert.ok(new Date(row.export_expires_at)-new Date(row.created_at)<=600000);
  const audit=(await db.query("SELECT * FROM audit_logs WHERE entity_id=$1",[row.id])).rows[0];
  assert.equal(audit.user_id,id(22));assert.equal(audit.organization_id,id(1));assert.equal(audit.metadata.ip,"192.0.2.1");
  await assert.rejects(create(51,22,2),/denied/);
  await assert.rejects(create(51,23),/denied/);
  await assert.rejects(create(51,24),/denied/);
  await create(52,21,2);
  await create(53,22,1,{status:"inactive"});
  await assert.rejects(db.query("INSERT INTO issuers(organization_id,name,slug,contact_email) VALUES($1,'No key','no-key','x@example.com')",[id(1)]),/requires encrypted/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM issuers WHERE slug='no-key'")).rows[0].n,0);
  for(const envelope of ["plaintext","{}"]) {
    const bad={...key(),encryptedPrivateKey:envelope};
    await assert.rejects(db.query("SELECT phase3_create_issuer($1::jsonb,$2::jsonb,$3,NULL)",
      [JSON.stringify(input(54)),JSON.stringify(bad),id(22)]));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM issuers WHERE id=$1",[id(54)])).rows[0].n,0);
  }
});
test("authenticated/anonymous users cannot read ciphertext or invoke privileged RPCs",async t=>{
  const {db,create}=await setup(t);await create();
  for(const role of ["authenticated","anon"]) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(db.query("SELECT * FROM issuer_keys"),/permission denied/);
      await assert.rejects(db.query("SELECT phase3_claim_export($1,$2,NULL)",[id(50),id(22)]),/permission denied/);
    } finally {await db.exec("RESET ROLE");}
  }
  await db.exec("SET ROLE authenticated");
  try {await assert.rejects(db.query("INSERT INTO issuers(organization_id,name,slug,contact_email) VALUES($1,'No','no','x@example.com')",[id(1)]),/permission denied/);}
  finally {await db.exec("RESET ROLE");}
  await assert.rejects(db.query(`INSERT INTO issuer_profiles(owner_issuer_id,issuer_name,display_name,did,verification_method,key_reference)
    VALUES($1,'Malicious','Malicious','did:web:attack.example','did:web:attack.example#1','ANOTHER_ISSUER_SECRET')`,[id(11)]),/server-controlled/);
});
test("initial private package claim is at-most-once, creator-bound, audited and expiring",async t=>{
  const {db,create}=await setup(t);await create();
  await assert.rejects(db.query("SELECT phase3_claim_export($1,$2,NULL)",[id(50),id(21)]),/unavailable/);
  await assert.rejects(db.query("SELECT phase3_claim_export($1,$2,NULL)",[id(50),id(23)]),/denied/);
  const claims=await Promise.allSettled([1,2].map(()=>db.query("SELECT phase3_claim_export($1,$2,'192.0.2.2')",[id(50),id(22)])));
  assert.equal(claims.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='key.download.claimed'")).rows[0].n,1);
  await create(51);
  await db.exec("SET TIME ZONE 'UTC'");
  await db.query("UPDATE issuer_keys SET export_claimed_at=now() WHERE issuer_id=$1",[id(51)]);
  await assert.rejects(db.query("SELECT phase3_claim_export($1,$2,NULL)",[id(51),id(22)]),/unavailable/);
  await assert.rejects(db.query("UPDATE issuer_keys SET export_claimed_at=NULL WHERE issuer_id=$1",[id(51)]),/immutable/);
  await db.exec("BEGIN");
  await db.query("INSERT INTO issuers(id,organization_id,name,slug,contact_email) VALUES($1,$2,'Expired','expired','expired@example.com')",[id(55),id(1)]);
  await db.query(`INSERT INTO issuer_keys(issuer_id,public_key,public_key_multibase,encrypted_private_key,encryption_key_id,
    fingerprint,key_version,created_by,created_at,export_expires_at)
    SELECT $1,public_key,public_key_multibase,encrypted_private_key,encryption_key_id,fingerprint,1,created_by,
      now()-interval '11 minutes',now()-interval '1 minute' FROM issuer_keys WHERE issuer_id=$2`,[id(55),id(50)]);
  await db.exec("COMMIT");
  await assert.rejects(db.query("SELECT phase3_claim_export($1,$2,NULL)",[id(55),id(22)]),/unavailable/);
});
test("rotation retains signing history, disallows version races and cannot reuse historical identity",async t=>{
  const {db,create,save}=await setup(t);await create();
  await assert.rejects(save(50,22),/unique|duplicate/);
  const first=(await db.query("SELECT id FROM issuer_keys WHERE issuer_id=$1",[id(50)])).rows[0].id;
  await assert.rejects(db.query("SELECT phase3_activate_key($1,$2,$3,NULL,NULL,NULL)",[id(50),first,id(22)]),/existing verification method/);
  await db.query("SELECT phase3_activate_key($1,$2,$3,'did:web:a.example','did:web:a.example#v1',NULL)",[id(50),first,id(22)]);
  const second=(await save(50,22)).rows[0].id;
  assert.equal((await db.query("SELECT status FROM issuer_keys WHERE id=$1",[first])).rows[0].status,"active");
  await assert.rejects(save(50,23,3),/denied/);
  await assert.rejects(db.query("SELECT phase3_activate_key($1,$2,$3,'did:web:a.example','did:web:a.example#v1',NULL)",[id(50),second,id(22)]),/cannot be reused/);
  await db.query("SELECT phase3_activate_key($1,$2,$3,'did:web:a.example','did:web:a.example#v2',NULL)",[id(50),second,id(22)]);
  assert.equal((await db.query("SELECT status FROM issuer_keys WHERE id=$1",[first])).rows[0].status,"retired");
  await assert.rejects(db.query("UPDATE issuer_keys SET issuer_id=$1 WHERE id=$2",[id(12),second]),/immutable/);
  await assert.rejects(db.query("UPDATE issuer_keys SET status='active' WHERE id=$1",[first]),/immutable/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='key.rotated'")).rows[0].n,1);
  await create(51);
  const sibling=(await db.query("SELECT id FROM issuer_keys WHERE issuer_id=$1",[id(51)])).rows[0].id;
  await assert.rejects(db.query("SELECT phase3_activate_key($1,$2,$3,'did:web:a.example','did:web:a.example#new',NULL)",[id(51),sibling,id(22)]),/cannot share/);
});
test("legacy key imports are transactional, platform-only and never exportable",async t=>{
  const {db,save}=await setup(t);
  const binding={controller:"did:web:legacy.example",verificationMethod:"did:web:legacy.example#key-1"};
  await assert.rejects(save(11,22,1,true,binding),/platform/);
  const entries=[{issuerId:id(11),key:{...key(),...binding}},{issuerId:id(999),key:{...key(),...binding}}];
  await assert.rejects(db.query("SELECT phase3_import_keys($1::jsonb,$2)",[JSON.stringify(entries),id(21)]));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM issuer_keys")).rows[0].n,0);
  await save(11,21,1,true,binding);
  const row=(await db.query("SELECT * FROM issuer_keys WHERE issuer_id=$1",[id(11)])).rows[0];
  assert.equal(row.status,"active");assert.equal(row.export_expires_at,null);
  await assert.rejects(db.query("SELECT phase3_claim_export($1,$2,NULL)",[id(11),id(21)]),/unavailable/);
  await db.query("SELECT phase3_import_keys($1::jsonb,$2)",
    [JSON.stringify([{issuerId:id(12),legacy:false,key:key()}]),id(21)]);
  const pending=(await db.query("SELECT * FROM issuer_keys WHERE issuer_id=$1",[id(12)])).rows[0];
  assert.equal(pending.status,"pending");assert.equal(pending.controller,null);
  assert.equal(pending.export_expires_at,null);
});
test("invitation reservation retries retain exactly one key and original export claim",async t=>{
  const {db}=await setup(t);
  const invite=(newId=id(50))=>db.query("SELECT phase3_prepare_invitation($1::jsonb,$2::jsonb,'issuer-operator',$3,NULL) AS reservation",
    [JSON.stringify({...input(50),id:newId}),JSON.stringify(key()),id(22)]);
  const first=(await invite()).rows[0].reservation;
  const second=(await invite(id(51))).rows[0].reservation;
  assert.equal(first.issuer.id,second.issuer.id);assert.equal(first.user_id,second.user_id);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM issuer_keys WHERE issuer_id=$1",[id(50)])).rows[0].n,1);
  await assert.rejects(db.query("SELECT phase3_prepare_invitation($1::jsonb,$2::jsonb,'viewer',$3,NULL)",
    [JSON.stringify({...input(50),contactEmail:"other@example.com"}),JSON.stringify(key()),id(22)]),/conflicts/);
});
test("credential key snapshots are immutable, issuer-bound and retain the actual signer across rotation",async t=>{
  const {db,create,save}=await setup(t);await create();
  const first=(await db.query("SELECT id FROM issuer_keys WHERE issuer_id=$1",[id(50)])).rows[0].id;
  await db.query("SELECT phase3_activate_key($1,$2,$3,'did:web:a.example','did:web:a.example#v1',NULL)",[id(50),first,id(22)]);
  const second=(await save(50,22)).rows[0].id;
  await db.query("SELECT phase3_activate_key($1,$2,$3,'did:web:a.example','did:web:a.example#v2',NULL)",[id(50),second,id(22)]);
  await db.query("INSERT INTO templates(id,issuer_id,organization_id,slug,name) VALUES($1,$2,$3,'new-template','Template')",[id(60),id(50),id(1)]);
  const insert=(keyId,issuer=id(50),method="did:web:a.example#v1",external="signed")=>db.query(
    `INSERT INTO credentials(issuer_id,template_id,signing_key_id,issuer_did,verification_method,external_id,recipient_name,recipient_email,credential)
     VALUES($1,$2,$3,'did:web:a.example',$4,$5,'Recipient','r@example.com','{}') RETURNING id,issuer_snapshot`,
    [issuer,id(60),keyId,method,external]);
  const row=(await insert(first)).rows[0];
  assert.equal(row.issuer_snapshot.keyId,first);assert.equal(row.issuer_snapshot.keyVersion,1);
  assert.equal(row.issuer_snapshot.keyFingerprint,"SHA256:fingerprint-1");
  await assert.rejects(insert(first,id(50),"did:web:a.example#foreign","bad-method"),/mismatch/);
  await assert.rejects(db.query("UPDATE credentials SET signing_key_id=$1 WHERE id=$2",[second,row.id]),/immutable/);
  const legacy=(await db.query("SELECT credential,signing_key_id FROM credentials WHERE id=$1",[id(41)])).rows[0];
  assert.equal(legacy.signing_key_id,null);
  assert.equal(legacy.credential,'{ "issuer": "did:web:legacy.example", "proof": { "proofValue": "keep-exact" } }\n');
});
test("master rewrap is transactional, audited and cannot change public identity",async t=>{
  const {db,create}=await setup(t);await create();
  const original=(await db.query("SELECT * FROM issuer_keys WHERE issuer_id=$1",[id(50)])).rows[0];
  const entry={id:original.id,previousEnvelope:original.encrypted_private_key,previousKeyId:"v1",
    envelope:JSON.stringify({v:1,iv:"b".repeat(16),tag:"b".repeat(24),data:"new-ciphertext"}),encryptionKeyId:"v2"};
  await assert.rejects(db.query("SELECT phase3_rewrap_keys($1::jsonb,$2)",[JSON.stringify([entry]),id(22)]),/Platform/);
  await assert.rejects(db.query("SELECT phase3_rewrap_keys($1::jsonb,$2)",[JSON.stringify([entry,{...entry,id:id(999)}]),id(21)]),/conflict/);
  assert.equal((await db.query("SELECT encryption_key_id FROM issuer_keys WHERE id=$1",[original.id])).rows[0].encryption_key_id,"v1");
  await db.query("SELECT phase3_rewrap_keys($1::jsonb,$2)",[JSON.stringify([entry]),id(21)]);
  const result=(await db.query("SELECT * FROM issuer_keys WHERE id=$1",[original.id])).rows[0];
  assert.equal(result.encryption_key_id,"v2");assert.equal(result.public_key,original.public_key);
  assert.equal(result.export_expires_at.toISOString(),original.export_expires_at.toISOString());
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='key.rewrapped'")).rows[0].n,1);
});
