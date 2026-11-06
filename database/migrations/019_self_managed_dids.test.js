const test=require("node:test");
const assert=require("node:assert/strict");
const {setup,id,key}=require("./fixtures/did-db");
async function app(t) {
  const fixture=await setup(t,true),{db}=fixture;
  const action=(name,payload={},revision=1,actor=22,org=1)=>db.query(
    "SELECT phase5_did_action($1,$2,$3,$4::jsonb,$5)",[id(org),id(actor),name,JSON.stringify(payload),revision]);
  const config=async()=>(await db.query("SELECT * FROM self_managed_dids WHERE organization_id=$1",[id(1)])).rows[0];
  const configure=()=>action("configure",{domain:"academy.com"},null);
  const validate=async()=>{
    const row=await config();
    await action("linkage",{document:{"@context":"public",linked_dids:["signed-public-jwt"]},expiresAt:"2099-01-01T00:00:00Z"},row.revision);
    await action("validate",{valid:true},(await config()).revision);
  };
  return{...fixture,action,config,configure,validate};
}
test("self-managed configuration retains managed DID/history, creates public multi-issuer files and enforces administrator/tenant boundaries",async t=>{
  const {db,as,create,document,action,config,configure,bytes}=await app(t);
  await create();
  const managed=await document();
  await assert.rejects(action("configure",{domain:"academy.com"},null,23),/management denied/);
  await assert.rejects(action("configure",{domain:"academy.com"},null,22,2),/management denied/);
  await configure();
  const row=await config();
  assert.equal(row.did,"did:web:academy.com");assert.equal(row.selected,false);assert.equal(row.validation_status,"pending");
  assert.equal(row.expected_document.verificationMethod.length,2);
  for(const method of row.expected_document.verificationMethod) {
    assert.equal(method.controller,row.did);assert.ok(method.id.startsWith(`${row.did}#issuer-`));
    assert.deepEqual(Object.keys(method).sort(),["controller","id","publicKeyMultibase","type"]);
  }
  assert.deepEqual((await document()).did_document,managed.did_document);
  assert.equal((await db.query("SELECT credential FROM credentials WHERE id=$1",[id(41)])).rows[0].credential,bytes);
  await assert.rejects(action("configure",{domain:"other.com"},null),/immutable/);
  await assert.rejects(action("configure",{domain:"academy.com"},null,21,2),/duplicate/);
  await assert.rejects(action("configure",{domain:"verifiable.sg"},null,21,2),/check constraint/);
  assert.equal((await as(23,"SELECT domain FROM self_managed_dids")).rows[0].domain,"academy.com");
  await assert.rejects(as(22,"UPDATE self_managed_dids SET selected=true"),/permission denied/);
  await assert.rejects(as(22,"SELECT phase5_did_action($1,$2,'managed','{}',1)",[id(1),id(22)]),/permission denied/);
  await db.exec("SET ROLE service_role");
  try {await assert.rejects(db.query("UPDATE self_managed_dids SET selected=true"),/permission denied/);}
  finally{await db.exec("RESET ROLE");}
});
test("self-managed activation needs validation, current revision and unexpired linkage; issuer changes stale it without managed fallback",async t=>{
  const {db,action,config,configure,validate,create}=await app(t);await configure();
  await assert.rejects(action("self-managed"),/Validate/);
  await validate();await action("self-managed",{},(await config()).revision);
  assert.equal((await config()).selected,true);
  const beforeRenew=(await config()).revision;
  await action("linkage",{document:{linked_dids:["replacement-jwt"]},expiresAt:"2099-01-01"},beforeRenew);
  await assert.rejects(action("validate",{valid:true},beforeRenew),/changed/);
  await action("validate",{valid:true},beforeRenew+1);
  await create();const stale=await config();
  assert.equal(stale.selected,true);assert.equal(stale.validation_status,"stale");assert.equal(stale.revision,4);
  await assert.rejects(action("validate",{valid:true},1),/changed/);
  await assert.rejects(action("self-managed",{},4),/Validate/);
  await action("managed",{},4);assert.equal((await config()).selected,false);
  await validate();await action("self-managed",{},(await config()).revision);
  await db.query("UPDATE self_managed_dids SET linkage_expires_at=now()-interval '1 hour' WHERE organization_id=$1",[id(1)]);
  await assert.rejects(action("self-managed",{},(await config()).revision),/Validate/);
  const events=(await db.query("SELECT action FROM audit_logs WHERE entity_type='self_managed_did'")).rows.map(row=>row.action);
  for(const name of ["configure","linkage","validate","self-managed","managed","deployment_stale"])assert.ok(events.includes(`organization.did.${name}`));
});
test("new keyed credentials follow the validated selected DID while historical signed bytes and retired public methods remain",async t=>{
  const {db,action,config,configure,validate}=await app(t);await configure();await validate();await action("self-managed",{},(await config()).revision);
  const row=await config(),method=row.expected_document.verificationMethod[0].id;
  const signer=(await db.query("SELECT id FROM issuer_keys WHERE issuer_id=$1 AND status='active'",[id(11)])).rows[0].id;
  const insert=(did,vm,external)=>db.query(`INSERT INTO credentials(issuer_id,template_id,signing_key_id,issuer_did,verification_method,
    external_id,recipient_name,recipient_email,credential) VALUES($1,$2,$3,$4,$5,$6,'Recipient','r@example.com','{}')
    RETURNING issuer_snapshot`,[id(11),id(31),signer,did,vm,external]);
  assert.equal((await insert(row.did,method,"self")).rows[0].issuer_snapshot.didUsed,row.did);
  await assert.rejects(insert("did:web:verifiable.sg:organizations:academy-a",
    method.replace(row.did,"did:web:verifiable.sg:organizations:academy-a"),"no-fallback"),/customer DID signing identity/);
  await action("managed",{},row.revision);await assert.rejects(insert(row.did,method,"old-mode"),/Managed credential/);
  await action("self-managed",{},row.revision);await db.query("SELECT phase3_save_key($1,$2::jsonb,$3,NULL)",[id(11),JSON.stringify(key(2)),id(21)]);
  const pending=(await db.query("SELECT id FROM issuer_keys WHERE issuer_id=$1 AND status='pending'",[id(11)])).rows[0].id;
  await db.query("SELECT phase4_activate_key($1,$2,$3,NULL)",[id(11),pending,id(21)]);
  assert.equal((await config()).validation_status,"stale");
  assert.equal((await config()).expected_document.assertionMethod.length,2);
  await assert.rejects(insert(row.did,method,"retired"),/ownership mismatch/);
});
