const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {setup,id,key}=require("./fixtures/did-db");

test("signer attribution migration projects existing snapshots without changing credential bytes, ownership or historical keys",async t=>{
  const {db,bytes,document}=await setup(t,true);
  const before=(await db.query("SELECT issuer_snapshot FROM credentials WHERE id=$1",[id(41)])).rows[0];
  await db.exec(readFileSync(`${__dirname}/020_credential_signer_attribution.sql`,"utf8"));
  const legacy=(await db.query("SELECT * FROM credentials WHERE id=$1",[id(41)])).rows[0];
  assert.equal(legacy.credential,bytes);assert.deepEqual(legacy.issuer_snapshot,before.issuer_snapshot);
  assert.equal(legacy.organization_id,id(1));assert.equal(legacy.issuer_id,id(11));
  assert.equal(legacy.did_used,"did:web:legacy.example");assert.equal(legacy.key_version,null);
  assert.equal(legacy.issuer_name,before.issuer_snapshot.issuerDisplayName);
  const identity=await document();
  const active=(await db.query("SELECT * FROM issuer_keys WHERE issuer_id=$1 AND status='active'",[id(11)])).rows[0];
  const method=identity.did_document.verificationMethod[0].id;
  const inserted=(await db.query(`INSERT INTO credentials(issuer_id,template_id,signing_key_id,issuer_did,verification_method,
    external_id,recipient_name,recipient_email,credential) VALUES($1,$2,$3,$4,$5,'new','Recipient','r@example.com','{}') RETURNING *`,
    [id(11),id(31),active.id,identity.did,method])).rows[0];
  assert.equal(inserted.did_used,identity.did);assert.equal(inserted.verification_method,method);
  assert.equal(inserted.key_fingerprint,active.fingerprint);assert.equal(inserted.key_version,1);
  await assert.rejects(db.query("UPDATE credentials SET key_fingerprint='forged' WHERE id=$1",[inserted.id]),/can only be updated to DEFAULT/);
  await db.query("SELECT phase3_save_key($1,$2::jsonb,$3,NULL)",[id(11),JSON.stringify(key(2)),id(21)]);
  const pending=(await db.query("SELECT id FROM issuer_keys WHERE issuer_id=$1 AND status='pending'",[id(11)])).rows[0];
  await db.query("SELECT phase4_activate_key($1,$2,$3,NULL)",[id(11),pending.id,id(21)]);
  const after=(await db.query("SELECT * FROM credentials WHERE id=$1",[inserted.id])).rows[0];
  assert.equal(after.key_version,1);assert.equal(after.key_fingerprint,active.fingerprint);
  assert.equal(after.signing_key_id,active.id);assert.equal(after.verification_method,method);
  assert.ok((await document()).did_document.assertionMethod.includes(method));
});
