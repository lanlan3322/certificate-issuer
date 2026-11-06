const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {setup,id}=require("./fixtures/did-db");
async function app(t) {
  const fixture=await setup(t,true),{db}=fixture;
  await db.query("INSERT INTO subscriptions(organization_id,plan_code,status,seats,current_period_ends_at) VALUES($1,'legacy-professional','past_due',8,'2030-01-01')",[id(1)]);
  for(const name of ["020_credential_signer_attribution","021_organization_document_stores","022_saas_subscriptions"])
    await db.exec(readFileSync(`${__dirname}/${name}.sql`,"utf8"));
  const snapshot=async(org=1)=>(await db.query("SELECT subscription_snapshot($1) data",[id(org)])).rows[0].data;
  async function assign(plan,extra={},actor=21,org=1) {
    const sub=(await snapshot(org)).subscription;
    return db.query("SELECT subscription_admin_action($1,$2,'assign',$3::jsonb)",[id(org),id(actor),JSON.stringify({
      plan,status:"active",version:sub.version,billable:true,monthlyPriceCents:89900,
      renewsAt:"2099-01-01T00:00:00Z",expiresAt:null,renew:false,...extra,
    })]);
  }
  const template=(n)=>db.query("INSERT INTO templates(issuer_id,slug,name) VALUES($1,$2,$2) RETURNING id",[id(11),`template-${n}`]);
  async function credential(n,amount=1,ignoreConflict=false) {
    const identity=await fixture.document(),method=identity.did_document.verificationMethod[0].id;
    const key=(await db.query("SELECT id FROM issuer_keys WHERE issuer_id=$1 AND status='active'",[id(11)])).rows[0].id;
    return db.query(`INSERT INTO credentials(issuer_id,template_id,signing_key_id,issuer_did,verification_method,external_id,recipient_name,recipient_email,credential,issued_at)
      SELECT $1,$2,$3,$4,$5,$6||'-'||series,'Recipient','r@example.com','{}','2000-01-01' FROM generate_series(1,$7) series
      ${ignoreConflict?"ON CONFLICT DO NOTHING":""} RETURNING id`,
      [id(11),id(31),key,identity.did,method,`new-${n}`,amount]);
  }
  return{...fixture,snapshot,assign,template,credential};
}
test("migration grandfathers existing organizations, backfills usage and provisions new organizations pending Starter",async t=>{
  const {db,snapshot,bytes}=await app(t);
  const state=await snapshot();
  assert.equal(state.subscription.plan,"enterprise");assert.equal(state.subscription.grandfathered,true);
  assert.equal(state.subscription.billable,false);assert.equal(state.usage.certificatesIssued,1);
  assert.equal(state.subscription.legacy_metadata.status,"past_due");
  assert.equal(state.subscription.legacy_metadata.plan_code,"legacy-professional");
  assert.equal(state.subscription.legacy_metadata.seats,8);
  assert.ok(state.usage.storageBytes>0);
  assert.equal((await db.query("SELECT credential FROM credentials WHERE id=$1",[id(41)])).rows[0].credential,bytes);
  await db.query("INSERT INTO organizations(id,name,slug,display_name) VALUES($1,'New','new-org','New')",[id(5)]);
  assert.equal((await snapshot(5)).subscription.status,"pending");assert.equal((await snapshot(5)).subscription.plan,"starter");
});
test("Starter limits allow exactly 1 issuer, 5 templates and 100 monthly certificates and roll back failed creations",async t=>{
  const {db,assign,template,credential,create,snapshot}=await app(t);
  await assign("starter");
  await assert.rejects(create(60),/SUBSCRIPTION_LIMIT: issuers/);
  for(let n=0;n<4;n++)await template(n);
  await assert.rejects(template(5),/SUBSCRIPTION_LIMIT: templates/);
  await db.query(`INSERT INTO templates(issuer_id,slug,name) VALUES($1,'legacy','Updated')
    ON CONFLICT(issuer_id,slug) DO UPDATE SET name=excluded.name`,[id(11)]);
  assert.equal((await snapshot()).usage.templatesCreated,5);
  for(let n=0;n<99;n++)await credential(n);
  assert.equal((await snapshot()).usage.certificatesIssued,100);
  await assert.rejects(credential(100),/SUBSCRIPTION_LIMIT: credentials/);
  await assert.rejects(credential(0),/SUBSCRIPTION_LIMIT|unique/);
  await db.query("UPDATE credentials SET status='revoked' WHERE id=$1",[id(41)]);
  assert.equal((await snapshot()).usage.certificatesIssued,100);
  await db.exec("BEGIN");await db.query("UPDATE subscriptions SET plan='enterprise' WHERE organization_id=$1",[id(1)]);
  await credential("rollback");await db.exec("ROLLBACK");
  assert.equal((await snapshot()).usage.certificatesIssued,100);
});
test("Professional enforcement, Enterprise unlimited, upgrades and UTC period reset preserve retained usage",async t=>{
  const {db,assign,template,credential,create,snapshot}=await app(t);
  await assign("professional");
  for(let n=60;n<64;n++)await create(n);
  await assert.rejects(create(65),/SUBSCRIPTION_LIMIT/);
  for(let n=0;n<9;n++)await template(n);
  await assert.rejects(template(10),/SUBSCRIPTION_LIMIT/);
  await db.query("UPDATE organization_usage_monthly SET certificates_issued=999 WHERE organization_id=$1",[id(1)]);
  await credential("last-professional");await assert.rejects(credential("over"),/SUBSCRIPTION_LIMIT/);
  await assign("enterprise");await create(65);await template(10);await credential("enterprise");
  assert.equal((await snapshot()).usage.certificatesIssued,1001);
  await assign("starter");
  await assert.rejects(credential("downgraded"),/SUBSCRIPTION_LIMIT/);
  await db.query("UPDATE organization_usage_monthly SET month=(date_trunc('month',now() AT TIME ZONE 'UTC')-interval '1 month')::date WHERE organization_id=$1",[id(1)]);
  assert.equal((await snapshot()).usage.certificatesIssued,0);
  await credential("new-month");assert.equal((await snapshot()).usage.certificatesIssued,1);
  assert.equal((await snapshot(2)).usage.certificatesIssued,0);
});
test("multi-row inserts cannot overspend quotas; ON CONFLICT and transaction rollback never consume allowance",async t=>{
  const {db,assign,credential,snapshot}=await app(t);
  await assign("starter");
  await db.query("UPDATE organization_usage_monthly SET certificates_issued=99 WHERE organization_id=$1",[id(1)]);
  await assert.rejects(credential("bulk",2),/SUBSCRIPTION_LIMIT/);
  assert.equal((await snapshot()).usage.certificatesIssued,99);
  assert.equal((await db.query("SELECT count(*)::integer n FROM credentials")).rows[0].n,1);
  await credential("bulk",1);
  await credential("bulk",1,true);
  assert.equal((await snapshot()).usage.certificatesIssued,100);
  await assert.rejects(db.query(`INSERT INTO templates(issuer_id,slug,name)
    SELECT $1,'multi-'||n,'Template' FROM generate_series(1,5) n`,[id(11)]),/SUBSCRIPTION_LIMIT/);
  assert.equal((await snapshot()).usage.templates,1);
  assert.equal((await snapshot()).usage.templatesCreated,1);
  await db.query(`INSERT INTO templates(issuer_id,slug,name)
    SELECT $1,'multi-'||n,'Template' FROM generate_series(1,4) n`,[id(11)]);
  assert.equal((await snapshot()).usage.templatesCreated,5);
});
test("inactive subscriptions block creations but retain updates, read and revocation; deleted issuer restoration cannot bypass quotas",async t=>{
  const {db,assign,template,credential,create,snapshot}=await app(t);
  await assign("starter",{status:"suspended"});
  for(const attempt of [()=>template(0),()=>credential(0),()=>create(60)])await assert.rejects(attempt(),/SUBSCRIPTION_INACTIVE/);
  await db.query("UPDATE templates SET name='Updated',is_active=false WHERE id=$1",[id(31)]);
  await db.query("UPDATE credentials SET status='revoked' WHERE id=$1",[id(41)]);
  await assign("enterprise");await create(60);
  await db.query("UPDATE issuers SET status='deleted' WHERE id=$1",[id(60)]);
  await assign("starter");
  await assert.rejects(db.query("UPDATE issuers SET status='active' WHERE id=$1",[id(60)]),/Deleted issuers are immutable/);
  await db.query("UPDATE subscriptions SET expires_at=now()-interval '1 second',started_at=now()-interval '1 day' WHERE organization_id=$1",[id(1)]);
  await db.query("UPDATE templates SET is_active=true WHERE id=$1",[id(31)]);
  await assert.rejects(credential("expired"),/SUBSCRIPTION_INACTIVE/);
  assert.equal((await snapshot()).usage.issuers,1);
});
test("subscription writes are service-RPC only, org admins request changes, and revenue excludes grandfathered or inactive contracts",async t=>{
  const {db,as,assign,snapshot}=await app(t);
  await assert.rejects(assign("starter",{},22),/Platform administrator/);
  await assert.rejects(db.query("SELECT subscription_admin_action($1,$2,'request',$3)",[id(2),id(22),{plan:"professional"}]),/denied/);
  await db.query("SELECT subscription_admin_action($1,$2,'request',$3)",[id(1),id(22),{plan:"professional"}]);
  await assert.rejects(db.query("SELECT subscription_admin_action($1,$2,'request',$3)",[id(1),id(22),{plan:"enterprise"}]),/unique/);
  assert.equal((await snapshot()).request.requested_plan,"professional");
  await assign("professional");assert.equal((await snapshot()).request,null);
  const metrics=async()=>(await db.query("SELECT subscription_platform_metrics() data")).rows[0].data;
  assert.equal((await metrics()).mrrCents,29900);
  await assign("enterprise",{monthlyPriceCents:89901},21,2);
  assert.equal((await metrics()).mrrCents,119801);
  await assert.rejects(assign("enterprise",{monthlyPriceCents:89899}),/minimum/);
  const previous=(await snapshot()).subscription;
  await assign("starter",{renew:true});
  assert.ok((await snapshot()).subscription.renewed_at);
  await assert.rejects(db.query("SELECT subscription_admin_action($1,$2,'assign',$3)",[id(1),id(21),
    {plan:"enterprise",status:"active",version:previous.version,billable:true,monthlyPriceCents:89900}]),/changed/);
  await assign("starter",{status:"canceled"});assert.equal((await metrics()).mrrCents,89901);
  assert.equal((await as(22,"SELECT * FROM subscriptions")).rows.length,1);
  assert.equal((await as(23,"SELECT * FROM subscriptions")).rows.length,0);
  assert.equal((await as(21,"SELECT * FROM subscriptions")).rows.length,
    (await db.query("SELECT count(*)::integer n FROM subscriptions")).rows[0].n);
  await assert.rejects(as(22,"UPDATE subscriptions SET plan='enterprise'"),/permission denied/);
  await assert.rejects(as(22,"SELECT subscription_snapshot($1)",[id(2)]),/permission denied/);
  await db.exec("SET ROLE service_role");
  try{
    await assert.rejects(db.exec("UPDATE subscriptions SET plan='enterprise'"),/permission denied/);
    await db.exec("INSERT INTO verification_logs(verified,result) VALUES(false,'{}')");
  }
  finally{await db.exec("RESET ROLE");}
  assert.equal((await metrics()).verificationVolume,1);
  await assert.rejects(as(23,"INSERT INTO verification_logs(verified,result) VALUES(false,'{}')"),/permission denied/);
});

test("platform subscription directory paginates without hiding pending organization requests",async t=>{
  const {db,as}=await app(t);
  await db.query("SELECT subscription_admin_action($1,$2,'request',$3)",[id(1),id(22),{plan:"professional"}]);
  await db.exec(`INSERT INTO organizations(name,display_name,slug)
    SELECT 'Page '||n,'Page '||n,'billing-page-'||n FROM generate_series(1,51) n`);
  const page=async offset=>(await db.query("SELECT subscription_directory($1) data",[offset])).rows[0].data;
  const first=await page(0),second=await page(50);
  assert.equal(first.items.length,50);assert.equal(first.hasMore,true);
  assert.equal(first.items[0].organizationId,id(1));assert.equal(first.items[0].requestedPlan,"professional");
  assert.equal(second.hasMore,false);
  const ids=[...first.items,...second.items].map(r=>r.organizationId);
  assert.equal(new Set(ids).size,(await db.query("SELECT count(*)::integer n FROM organizations")).rows[0].n);
  await assert.rejects(as(22,"SELECT subscription_directory(0)"),/permission denied/);
});
