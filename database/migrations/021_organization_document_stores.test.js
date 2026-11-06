const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {setup,id}=require("./fixtures/did-db");
async function app(t) {
  const fixture=await setup(t,true),{db}=fixture;
  for(const n of ["020_credential_signer_attribution","021_organization_document_stores"])
    await db.exec(readFileSync(`${__dirname}/${n}.sql`,"utf8"));
  const action=(name,store=null,payload={},actor=22,org=1)=>db.query(
    "SELECT organization_store_action($1,$2,$3,$4,$5::jsonb)",[id(org),id(actor),name,store,JSON.stringify(payload)]);
  const list=async org=>(await db.query("SELECT * FROM organization_document_stores WHERE organization_id=$1 ORDER BY created_at,id",[id(org)])).rows;
  async function add(address,org=1,actor=22) {
    await action("add",null,{network:"sepolia",address},actor,org);
    return(await list(org)).find(row=>row.contract_address===address).id;
  }
  async function activate(store,org=1) {
    await action("approve",store,{},21,org);
    await action("test",store,{ok:true,signer:"0xpublic-wallet"},21,org);
    await action("activate",store,{},21,org);
  }
  return{...fixture,action,list,add,activate};
}
test("organization stores enforce tenant RLS, platform approval, network limits, unique assignment and service-only audited writes",async t=>{
  const {db,as,action,add,activate,list}=await app(t);
  const address="0x1111111111111111111111111111111111111111",store=await add(address);
  assert.equal((await list(1))[0].status,"pending");
  await assert.rejects(action("approve",store),/Platform approval/);
  await assert.rejects(action("activate",store),/approval/);
  await assert.rejects(action("test",store,{ok:true},23),/denied/);
  await assert.rejects(action("test",store,{ok:true},22,2),/denied/);
  await assert.rejects(action("add",null,{network:"mainnet",address:"0x2222222222222222222222222222222222222222"}),/check constraint/);
  await assert.rejects(action("add",null,{network:"sepolia",address},21,2),/unique/);
  await activate(store);
  await db.query("UPDATE organization_document_stores SET checked_at=now()-interval '11 minutes' WHERE id=$1",[store]);
  await assert.rejects(action("activate",store),/recent successful test/);
  await action("test",store,{ok:true,signer:"public"});
  assert.equal((await as(23,"SELECT * FROM organization_document_stores")).rows.length,1);
  await db.query("UPDATE users SET organization_id=$1,issuer_id=NULL WHERE id=$2",[id(2),id(24)]);
  assert.equal((await as(24,"SELECT * FROM organization_document_stores")).rows.length,0);
  await assert.rejects(as(22,"UPDATE organization_document_stores SET status='active'"),/permission denied/);
  await assert.rejects(as(22,"SELECT organization_store_action($1,$2,'activate',$3,'{}')",[id(1),id(22),store]),/permission denied/);
  await db.exec("SET ROLE service_role");
  try{await assert.rejects(db.exec("UPDATE organization_document_stores SET status='active'"),/permission denied/);}
  finally{await db.exec("RESET ROLE");}
  const events=(await db.query("SELECT action FROM audit_logs WHERE entity_type='organization_document_store'")).rows.map(r=>r.action);
  for(const a of ["add","approve","test","activate"])assert.ok(events.includes(`organization.document_store.${a}`));
});
test("active store switching is atomic and historical signed bytes and issuance-time stores cannot be changed",async t=>{
  const {db,bytes,document,add,activate,action,list}=await app(t);
  assert.equal((await db.query("SELECT credential FROM credentials WHERE id=$1",[id(41)])).rows[0].credential,bytes);
  const first=await add("0x1111111111111111111111111111111111111111"),second=await add("0x2222222222222222222222222222222222222222");
  await activate(first);
  const identity=await document(),method=identity.did_document.verificationMethod[0].id;
  const key=(await db.query("SELECT id FROM issuer_keys WHERE issuer_id=$1 AND status='active'",[id(11)])).rows[0].id;
  const insert=(store,address,external)=>db.query(`INSERT INTO credentials(issuer_id,template_id,signing_key_id,issuer_did,verification_method,
    organization_document_store_id,document_store_address,document_store_network,external_id,recipient_name,recipient_email,credential)
    VALUES($1,$2,$3,$4,$5,$6,$7,'sepolia',$8,'Recipient','r@example.com','{}') RETURNING *`,
    [id(11),id(31),key,identity.did,method,store,address,external]);
  const saved=(await insert(first,"0x1111111111111111111111111111111111111111","first")).rows[0];
  assert.equal(saved.issuer_snapshot.documentStoreId,first);
  await assert.rejects(insert(null,saved.document_store_address,"missing"),/snapshot required/);
  await assert.rejects(insert(second,saved.document_store_address,"wrong"),/snapshot required/);
  await activate(second);
  assert.equal((await list(1)).filter(s=>s.status==="active").length,1);
  await assert.rejects(insert(first,saved.document_store_address,"stale"),/snapshot required/);
  const current=(await insert(second,"0x2222222222222222222222222222222222222222","second")).rows[0];
  assert.equal(current.organization_document_store_id,second);
  await assert.rejects(db.query("UPDATE credentials SET organization_document_store_id=$1 WHERE id=$2",[second,saved.id]),/immutable/);
  await db.query("UPDATE credentials SET status='revoked' WHERE id=$1",[saved.id]);
  assert.equal((await db.query("SELECT document_store_address FROM credentials WHERE id=$1",[saved.id])).rows[0].document_store_address,saved.document_store_address);
  await action("test",second,{ok:false});
  await assert.rejects(insert(second,current.document_store_address,"failed"),/snapshot required/);
  await assert.rejects(action("activate",second),/successful test/);
  await action("deactivate",second);
  assert.equal((await list(1)).filter(s=>s.status==="active").length,0);
});
