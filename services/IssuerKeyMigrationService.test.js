const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
function load(file,mocks={}) {
  const filename=path.resolve(__dirname,file),instance=new Module(filename,module);
  instance.filename=filename;instance.paths=Module._nodeModulePaths(path.dirname(filename));
  const native=instance.require.bind(instance);
  instance.require=name=>Object.hasOwn(mocks,name)?mocks[name]:native(name);
  instance._compile(ts.transpileModule(readFileSync(filename,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText,filename);
  return instance.exports;
}
const crypto=load("../lib/issuer-key-crypto.ts");
function setup(t) {
  const env={...process.env};t.after(()=>{process.env=env;});
  process.env.ISSUER_KEY_ENCRYPTION_KEY=Buffer.alloc(32,14).toString("base64");
  process.env.ISSUER_KEY_ENCRYPTION_KEY_ID="v1";
  delete process.env.ISSUER_KEY_ENCRYPTION_PREVIOUS_KEYS;
  process.env.ISSUER_LEGACY_PROFILE_KEY_REFERENCES="[]";
  const key=crypto.provisionKey("org","issuer",1);
  const signer=crypto.signingMultikey(crypto.privateKeyObject(key.encryptedPrivateKey,{
    organizationId:"org",issuerId:"issuer",keyVersion:1,encryptionKeyId:"v1",
  }),"did:web:legacy.example","did:web:legacy.example#v1");
  process.env.DID_CONTROLLER=signer.did;process.env.DID_KEY_ID=signer.verificationMethod;
  process.env.DID_PUBLIC_KEY_MULTIBASE=signer.publicKeyMultibase;process.env.DID_PRIVATE_KEY_MULTIBASE=signer.secretKeyMultibase;
  const tables={
    issuers:[{id:"issuer",organization_id:"org"}],issuer_profiles:[],issuer_keys:[],
    credentials:[{id:"credential",issuer_id:"issuer",issuer_did:signer.did,verification_method:signer.verificationMethod}],
  },calls=[],reads=[];
  let rpcError=null;
  const client={
    from(table) {
      const query={select:()=>query,order:()=>query,
        range(from,to){reads.push([table,from,to]);return{returns:async()=>({data:tables[table].slice(from,to+1),error:null})};}};
      return query;
    },
    async rpc(...args){calls.push(args);return{data:null,error:rpcError};},
  };
  const {IssuerKeyMigrationService:service}=load("IssuerKeyMigrationService.ts",{
    "../lib/supabase/server":{getSupabaseAdmin:()=>client},"../lib/issuer-key-crypto":crypto,
  });
  return{service,key,signer,tables,calls,reads,setRpcError:value=>rpcError=value};
}
test("legacy preflight imports the actual signer, preserves credentials and writes only on explicit apply",async t=>{
  const app=setup(t),before=JSON.stringify(app.tables.credentials);
  const plan=await app.service.plan();
  assert.equal(app.calls.length,0);assert.equal(plan.length,1);
  assert.equal(plan[0].key.fingerprint,app.key.fingerprint);
  assert.equal(plan[0].key.controller,app.signer.did);
  assert.equal(JSON.stringify(app.tables.credentials),before);
  assert.ok(!JSON.stringify(plan).includes(app.signer.secretKeyMultibase));
  await app.service.apply("platform-actor",plan);
  assert.equal(app.calls[0][0],"phase3_import_keys");
  assert.equal(app.calls[0][1].p_actor,"platform-actor");
  app.tables.issuer_keys.push({id:"key",issuer_id:"issuer"});
  assert.deepEqual(await app.service.plan(),[]);
});
test("legacy profile references need operator approval; ambiguity and historical mismatches fail before writes",async t=>{
  const app=setup(t);
  const profile={id:"profile",owner_issuer_id:"issuer",did:app.signer.did,
    verification_method:app.signer.verificationMethod,key_reference:"APPROVED_PROFILE_KEY"};
  app.tables.issuer_profiles.push(profile);
  process.env.APPROVED_PROFILE_KEY=app.signer.secretKeyMultibase;
  process.env.APPROVED_PROFILE_KEY_PUBLIC_KEY_MULTIBASE=app.signer.publicKeyMultibase;
  await assert.rejects(app.service.plan(),/approve existing profile/);
  process.env.ISSUER_LEGACY_PROFILE_KEY_REFERENCES='["APPROVED_PROFILE_KEY"]';
  assert.equal((await app.service.plan()).length,1);
  app.tables.issuer_profiles.push({...profile,id:"second",did:"did:web:second.example"});
  await assert.rejects(app.service.plan(),/multiple existing signing identities/);
  app.tables.issuer_profiles.pop();app.tables.credentials[0].issuer_did="did:web:foreign.example";
  await assert.rejects(app.service.plan(),/historical credential/);
  assert.equal(app.calls.length,0);
});
test("migration inventory paginates beyond Supabase limits and fails closed on missing legacy secrets",async t=>{
  const app=setup(t);
  app.tables.issuers=Array.from({length:501},(_,n)=>({id:`issuer-${n}`,organization_id:"org"}));
  app.tables.credentials=[];
  const plan=await app.service.plan();assert.equal(plan.length,501);
  assert.ok(app.reads.some(([table,from])=>table==="issuers"&&from===500));
  delete process.env.DID_PRIVATE_KEY_MULTIBASE;
  await assert.rejects(app.service.plan(),/complete existing P-256 signer/);
  assert.equal(app.calls.length,0);
});
test("master-key rewrap validates all encrypted material, keeps identity/version and hides database failures",async t=>{
  const app=setup(t);
  app.tables.issuer_keys=[{id:"key",issuer_id:"issuer",key_version:1,fingerprint:app.key.fingerprint,
    encrypted_private_key:app.key.encryptedPrivateKey,encryption_key_id:"v1"}];
  process.env.ISSUER_KEY_ENCRYPTION_PREVIOUS_KEYS=JSON.stringify({v1:process.env.ISSUER_KEY_ENCRYPTION_KEY});
  process.env.ISSUER_KEY_ENCRYPTION_KEY=Buffer.alloc(32,9).toString("base64");
  process.env.ISSUER_KEY_ENCRYPTION_KEY_ID="v2";
  assert.equal(await app.service.rewrap("platform-actor",false),1);
  assert.equal(app.calls.length,0);
  assert.equal(await app.service.rewrap("platform-actor",true),1);
  const entry=app.calls[0][1].p_entries[0];
  assert.equal(entry.encryptionKeyId,"v2");
  const object=crypto.privateKeyObject(entry.envelope,{
    organizationId:"org",issuerId:"issuer",keyVersion:1,encryptionKeyId:"v2",
  });
  assert.equal(crypto.publicMaterial(object).fingerprint,app.key.fingerprint);
  app.setRpcError({message:"private diagnostics"});
  await assert.rejects(app.service.rewrap("platform-actor",true),/failed transactionally/);
  await assert.rejects(app.service.apply("platform-actor",[]),/failed transactionally/);
});
test("unused issuers without any historical identity get pending keys, never a false legacy binding",async t=>{
  const app=setup(t);
  for(const name of ["DID_CONTROLLER","NEXT_PUBLIC_DID_CONTROLLER","DID_KEY_ID","NEXT_PUBLIC_DID_KEY_ID",
    "DID_PUBLIC_KEY_MULTIBASE","NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE","DID_PRIVATE_KEY_MULTIBASE"])delete process.env[name];
  app.tables.credentials=[];
  const plan=await app.service.plan();
  assert.equal(plan.length,1);assert.equal(plan[0].legacy,false);
  assert.equal(plan[0].key.controller,undefined);assert.equal(plan[0].key.verificationMethod,undefined);
  app.tables.credentials=[{id:"historical",issuer_id:"issuer"}];
  await assert.rejects(app.service.plan(),/complete existing P-256 signer/);
});
