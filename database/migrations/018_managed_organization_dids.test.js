const test=require("node:test");
const assert=require("node:assert/strict");
const {setup,id,key}=require("./fixtures/did-db");
const prefix="did:web:verifiable.sg:organizations:";

test("backfill creates one immutable managed DID per organization and preserves legacy signed bytes/bindings",async t=>{
  const {db,document,bytes}=await setup(t);
  const a=await document(),b=await document(2);
  assert.equal(a.did,`${prefix}academy-a`);assert.equal(a.method,"did:web");assert.equal(a.hosting_mode,"managed");
  assert.equal(a.did_document.verificationMethod.length,1);assert.equal(b.did_document.verificationMethod.length,1);
  const legacy=(await db.query("SELECT credential,issuer_did FROM credentials WHERE id=$1",[id(41)])).rows[0];
  assert.equal(legacy.credential,bytes);assert.equal(legacy.issuer_did,"did:web:legacy.example");
  assert.equal((await db.query("SELECT controller FROM issuer_keys WHERE issuer_id=$1",[id(11)])).rows[0].controller,"did:web:legacy.example");
  assert.equal((await db.query("SELECT status FROM issuer_keys WHERE issuer_id=$1",[id(12)])).rows[0].status,"active");
  await db.query("UPDATE organizations SET slug='renamed' WHERE id=$1",[id(1)]);
  assert.equal((await document()).did,a.did);assert.equal((await document()).path_slug,"academy-a");
  await assert.rejects(db.query("INSERT INTO organizations(name,display_name,slug) VALUES('Hijack','Hijack','academy-a')"),/duplicate/);
});
test("organization creation provisions DID atomically; issuer addition and lifecycle rebuild public document with history",async t=>{
  const {db,create,document}=await setup(t);
  await db.query("INSERT INTO organizations(id,name,display_name,slug,created_by) VALUES($1,'New','New','new-academy',$2)",[id(3),id(21)]);
  assert.equal((await document(3)).did,`${prefix}new-academy`);
  await create();
  const initial=await document();
  assert.equal(initial.did_document.verificationMethod.length,2);
  assert.equal(initial.did_document.assertionMethod.length,2);
  const method=initial.did_document.verificationMethod.find(m=>m.id.includes(id(50)));
  assert.equal(method.controller,initial.did);assert.equal(method.type,"Multikey");
  await db.query("UPDATE issuers SET status='inactive' WHERE id=$1",[id(50)]);
  const inactive=(await document()).did_document;
  assert.deepEqual(inactive.verificationMethod,initial.did_document.verificationMethod);
  assert.ok(inactive.assertionMethod.includes(method.id));assert.ok(!inactive.authentication.includes(method.id));
  assert.equal((await db.query("SELECT status FROM organization_verification_methods WHERE issuer_id=$1",[id(50)])).rows[0].status,"inactive");
  await db.query("UPDATE issuers SET status='active' WHERE id=$1",[id(50)]);
  assert.ok((await document()).did_document.authentication.includes(method.id));
  await db.query("UPDATE organizations SET status='disabled' WHERE id=$1",[id(1)]);
  assert.equal((await document()).status,"inactive");assert.deepEqual((await document()).did_document.authentication,[]);
  assert.equal((await document()).did_document.assertionMethod.length,2);
  const events=(await db.query("SELECT action FROM audit_logs WHERE organization_id=$1",[id(1)])).rows.map(r=>r.action);
  for(const action of ["organization.did.created","organization.did.updated","issuer.method.added","issuer.method.removed"])assert.ok(events.includes(action));
});
test("tenant RLS exposes own organization DID and assigned methods but rejects direct edits and secret reads",async t=>{
  const {db,as,create}=await setup(t);await create();
  assert.ok((await as(21,"SELECT organization_id FROM organization_dids")).rows.length>=3);
  for(const n of [22,23,24]) {
    const identities=(await as(n,"SELECT organization_id FROM organization_dids")).rows;
    assert.deepEqual(identities.map(r=>r.organization_id),[id(1)]);
    const methods=(await as(n,"SELECT issuer_id FROM organization_verification_methods")).rows;
    assert.ok(methods.every(row=>row.issuer_id===id(11) || n===22));
    await assert.rejects(as(n,"UPDATE organization_dids SET did_document='{}'"),/permission denied/);
    await assert.rejects(as(n,"INSERT INTO organization_verification_methods DEFAULT VALUES"),/permission denied/);
    await assert.rejects(as(n,"SELECT encrypted_private_key FROM issuer_keys"),/permission denied/);
  }
  await db.exec("SET ROLE anon");
  try {await assert.rejects(db.query("SELECT * FROM organization_dids"),/permission denied/);}
  finally{await db.exec("RESET ROLE");}
});
test("managed key rotation is issuer-owned, keeps prior methods and snapshots exact signing identity",async t=>{
  const {db,as,create,document}=await setup(t);await create();
  const before=await document();
  const saved=(await db.query("SELECT phase3_save_key($1,$2::jsonb,$3,NULL) AS id",[id(50),JSON.stringify(key(2)),id(21)])).rows[0].id;
  assert.deepEqual((await document()).did_document,before.did_document);
  await assert.rejects(db.query("SELECT phase4_activate_key($1,$2,$3,NULL)",[id(11),saved,id(22)]),/Pending/);
  await assert.rejects(db.query("SELECT phase4_activate_key($1,$2,$3,NULL)",[id(50),saved,id(23)]),/denied/);
  await db.query("SELECT phase4_activate_key($1,$2,$3,NULL)",[id(50),saved,id(22)]);
  const after=(await document()).did_document;
  assert.equal(after.verificationMethod.length,3);assert.equal(after.assertionMethod.length,3);assert.equal(after.authentication.length,2);
  const method=after.verificationMethod.find(m=>m.id.endsWith(`${id(50)}-key-2`));
  await db.query("INSERT INTO templates(id,issuer_id,organization_id,slug,name) VALUES($1,$2,$3,'new','New')",[id(61),id(50),id(1)]);
  const result=(await db.query(`INSERT INTO credentials(issuer_id,template_id,signing_key_id,issuer_did,verification_method,
    external_id,recipient_name,recipient_email,credential) VALUES($1,$2,$3,$4,$5,'managed','R','r@example.com','{}')
    RETURNING id,issuer_snapshot`,[id(50),id(61),saved,after.id,method.id])).rows[0];
  assert.equal(result.issuer_snapshot.didUsed,after.id);assert.equal(result.issuer_snapshot.keyVersion,2);
  assert.equal(result.issuer_snapshot.keyFingerprint,"SHA256:key-2");
  await assert.rejects(db.query("UPDATE credentials SET issuer_did='did:web:foreign.example' WHERE id=$1",[result.id]),/immutable/);
  const retired=(await db.query("SELECT id,verification_method FROM issuer_keys WHERE issuer_id=$1 AND status='retired'",[id(50)])).rows[0];
  const insert=`INSERT INTO credentials(issuer_id,template_id,signing_key_id,issuer_did,verification_method,
    external_id,recipient_name,recipient_email,credential) VALUES($1,$2,$3,$4,$5,$6,'R','r@example.com','{}')`;
  await db.exec("GRANT SELECT,INSERT ON credentials TO authenticated; GRANT SELECT ON issuers,templates TO authenticated");
  await db.query("INSERT INTO issuer_members(issuer_id,user_id,role) VALUES($1,$2,'issuer_operator')",[id(50),id(23)]);
  await as(23,insert,[id(50),id(61),saved,after.id,method.id,"active-authenticated-insert"]);
  await assert.rejects(as(23,insert,[id(50),id(61),retired.id,after.id,retired.verification_method,"retired-insert"]),/signing key ownership mismatch/);
  await db.query("UPDATE organization_verification_methods SET status='inactive' WHERE key_id=$1",[saved]);
  await assert.rejects(as(23,insert,[id(50),id(61),saved,after.id,method.id,"inactive-method-insert"]),/identity mismatch/);
  await db.query("UPDATE organization_verification_methods SET status='active' WHERE key_id=$1",[saved]);
  await db.query("UPDATE organization_dids SET status='inactive' WHERE organization_id=$1",[id(1)]);
  await assert.rejects(as(23,insert,[id(50),id(61),saved,after.id,method.id,"inactive-did-insert"]),/identity mismatch/);
  await db.query("UPDATE organization_dids SET status='active' WHERE organization_id=$1",[id(1)]);
  await db.query("UPDATE issuers SET status='inactive' WHERE id=$1",[id(50)]);
  await assert.rejects(as(23,insert,[id(50),id(61),saved,after.id,method.id,"inactive-insert"]),/Active issuer and organization required/);
  await db.query("UPDATE issuers SET status='active' WHERE id=$1",[id(50)]);
  await db.query("UPDATE organizations SET status='disabled' WHERE id=$1",[id(1)]);
  await assert.rejects(as(23,insert,[id(50),id(61),saved,after.id,method.id,"disabled-org-insert"]),/Issuer not found/);
});
test("managed status lists isolate allocation snapshots and downloads record authorized actors",async t=>{
  const {db}=await setup(t);
  await db.query("SELECT phase4_reserve_status($1,$2,'org-a-reserved')",[id(1),id(11)]);
  await db.query("SELECT phase4_reserve_status($1,$2,'org-b-reserved')",[id(2),id(12)]);
  await assert.rejects(db.query("SELECT phase4_reserve_status($1,$2,'cross-tenant')",[id(1),id(12)]),/ownership/);
  const snapshot=(await db.query("SELECT phase4_read_status($1,0) AS entries",[id(1)])).rows[0].entries;
  assert.equal(snapshot.length,1);assert.equal(snapshot[0].status,"revoked");
  await db.query("SELECT phase4_audit_download($1,$2)",[id(1),id(22)]);
  await assert.rejects(db.query("SELECT phase4_audit_download($1,$2)",[id(2),id(22)]),/denied/);
  const audit=(await db.query("SELECT user_id FROM audit_logs WHERE action='organization.did.downloaded'")).rows[0];
  assert.equal(audit.user_id,id(22));
});
