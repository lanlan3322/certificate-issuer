const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
const JSZip=require("jszip");
const {createPrivateKey,createPublicKey,sign,verify}=require("node:crypto");
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
const issuerId="00000000-0000-4000-8000-000000000011",org="00000000-0000-4000-8000-000000000001";
const actor="00000000-0000-4000-8000-000000000021";

function setup(t,{status="active"}={}) {
  const previous=process.env.ISSUER_KEY_ENCRYPTION_KEY;
  process.env.ISSUER_KEY_ENCRYPTION_KEY=Buffer.alloc(32,3).toString("base64");
  t.after(()=>previous===undefined?delete process.env.ISSUER_KEY_ENCRYPTION_KEY:process.env.ISSUER_KEY_ENCRYPTION_KEY=previous);
  const generated=crypto.provisionKey(org,issuerId,1);
  const key={id:"key-1",issuer_id:issuerId,public_key:generated.publicKey,
    public_key_multibase:generated.publicKeyMultibase,encrypted_private_key:generated.encryptedPrivateKey,
    encryption_key_id:generated.encryptionKeyId,fingerprint:generated.fingerprint,algorithm:"P-256",
    key_version:1,status,controller:status==="active"?"did:web:issuer.example":null,
    verification_method:status==="active"?"did:web:issuer.example#v1":null,
    created_by:actor,created_at:new Date().toISOString(),rotated_at:null,
    export_claimed_at:null,export_expires_at:new Date(Date.now()+600000).toISOString()};
  const owner={id:issuerId,organization_id:org,name:"Issuer",display_name:"Issuer",
    did_uri:"did:web:issuer.example",verification_method:"did:web:issuer.example#v1",
    organizations:{display_name:"Organization"}};
  const tables={issuers:[owner],issuer_keys:[key],issuer_profiles:[],
    organization_verification_methods:[{id:"method",organization_id:org,issuer_id:issuerId,key_id:key.id,created_at:key.created_at}]};
  const rpcCalls=[];
  let published={id:owner.did_uri,verificationMethod:[{id:owner.verification_method,type:"Multikey",
    controller:owner.did_uri,publicKeyMultibase:key.public_key_multibase}],assertionMethod:[owner.verification_method]};
  let rpcError=null;
  const client={
    from(table) {
      const filters=[];let max=Infinity,sort;
      const query={
        select(){return query;},eq(k,v){filters.push(r=>r[k]===v);return query;},
        neq(k,v){filters.push(r=>r[k]!==v);return query;},
        in(k,v){filters.push(r=>v.includes(r[k]));return query;},
        is(k,v){filters.push(r=>r[k]===v);return query;},
        gt(k,v){filters.push(r=>r[k]>v);return query;},
        order(k,{ascending=true}={}){sort={k,ascending};return query;},
        limit(n){max=n;return query;},
        result() {
          let data=tables[table].filter(r=>filters.every(filter=>filter(r)));
          if(sort)data=[...data].sort((a,b)=>(a[sort.k]>b[sort.k]?1:-1)*(sort.ascending?1:-1));
          return{data:data.slice(0,max),error:null};
        },
        async single(){const result=query.result();return{data:result.data[0]??null,error:result.data.length===1?null:{message:"sensitive database diagnostics"}};},
        async maybeSingle(){const result=query.result();return{data:result.data[0]??null,error:result.data.length<=1?null:{message:"multiple rows"}};},
        then(resolve,reject){return Promise.resolve(query.result()).then(resolve,reject);},
      };
      return query;
    },
    async rpc(name,input) {
      rpcCalls.push([name,input]);
      if(rpcError)return{data:null,error:rpcError};
      if(name==="phase3_claim_export") {
        if(key.export_claimed_at)return{data:null,error:{message:"already claimed"}};
        key.export_claimed_at=new Date().toISOString();
        return{data:key.id,error:null};
      }
      return{data:"new-key",error:null};
    },
  };
  const {IssuerKeyService:service,assertPublishedKey}=load("IssuerKeyService.ts",{
    "../lib/supabase/server":{getSupabaseAdmin:()=>client},
    "../lib/issuer-key-crypto":crypto,
    "./ManagedDIDService":{ManagedDIDService:{statusOwner:async()=>org,binding:async(id,keyId)=>{
      assert.equal(id,issuerId);assert.equal(keyId,key.id);
      return{did:"did:web:verifiable.sg:organizations:academy",verificationMethod:`did:web:verifiable.sg:organizations:academy#issuer-${issuerId}-key-1`};
    }}},
    "../lib/safe-document-loader":{createSafeDocumentLoader:()=>async()=>({document:published})},
  });
  return{service,assertPublishedKey,key,owner,tables,rpcCalls,
    setPublished:value=>published=value,setRpcError:value=>rpcError=value};
}

test("safe key reads expose only fingerprints to members and never serialize ciphertext or export state",async t=>{
  const app=setup(t);
  const member=await app.service.list(issuerId,actor,false);
  assert.deepEqual(Object.keys(member[0]).sort(),["downloadAvailable","fingerprint","id","issuerId"]);
  const admin=await app.service.list(issuerId,actor,true);
  assert.equal(admin[0].publicKey,app.key.public_key);assert.equal(admin[0].downloadAvailable,true);
  assert.equal((await app.service.list(issuerId,"other-admin",true))[0].downloadAvailable,false);
  for(const payload of [member,admin]) {
    const text=JSON.stringify(payload);
    for(const field of ["encrypted_private_key","encryptedPrivateKey","created_by","export_claimed_at","PRIVATE KEY"])assert.ok(!text.includes(field));
    assert.ok(!text.includes(app.key.encrypted_private_key));
  }
});
test("issuer-specific signer resolves encrypted material, denies pending keys and never falls back to deployment secrets",async t=>{
  const app=setup(t);
  const context=await app.service.signer(issuerId);
  assert.equal(context.keyId,app.key.id);assert.equal(context.publicKeyMultibase,app.key.public_key_multibase);
  assert.equal(context.did,"did:web:verifiable.sg:organizations:academy");
  assert.notEqual(context.did,app.key.controller);
  await assert.rejects(app.service.signer("sibling"),/no usable signing key/);
  app.key.status="pending";
  await assert.rejects(app.service.signer(issuerId),/no usable signing key/);
  app.key.status="active";app.owner.organization_id="other-org";
  await assert.rejects(app.service.signer(issuerId),/authentication failed/);
});
test("one-time ZIP contains a matching PKCS8 private PEM, public SPKI PEM and non-secret metadata",async t=>{
  const app=setup(t);
  const claims=await Promise.allSettled([1,2].map(()=>app.service.download(issuerId,actor,"192.0.2.1")));
  assert.equal(claims.filter(result=>result.status==="fulfilled").length,1);
  const bytes=claims.find(result=>result.status==="fulfilled").value;
  const zip=await JSZip.loadAsync(bytes);
  assert.deepEqual(Object.keys(zip.files).sort(),["issuer-private.pem","issuer-public.pem","metadata.json"]);
  const privatePem=await zip.file("issuer-private.pem").async("string");
  const publicPem=await zip.file("issuer-public.pem").async("string");
  const message=Buffer.from("proof");
  assert.ok(verify("sha256",message,createPublicKey(publicPem),sign("sha256",message,createPrivateKey(privatePem))));
  const metadata=JSON.parse(await zip.file("metadata.json").async("string"));
  assert.equal(metadata.fingerprint,app.key.fingerprint);assert.equal(metadata.algorithm,"P-256");
  assert.ok(!JSON.stringify(metadata).includes("PRIVATE KEY"));
  await assert.rejects(app.service.download(issuerId,actor,"192.0.2.1"),/unavailable/);
  assert.ok(!JSON.stringify(app.rpcCalls).includes(privatePem));
});
test("rotation creates a pending version only and explicit managed activation is atomic without an external publication dependency",async t=>{
  const app=setup(t);
  await app.service.rotate(issuerId,actor,"192.0.2.1");
  const [name,input]=app.rpcCalls[0];
  assert.equal(name,"phase3_save_key");assert.equal(input.p_key.keyVersion,2);
  assert.equal("controller" in input.p_key,false);assert.equal(app.key.status,"active");
  app.key.status="pending";app.key.controller=null;app.key.verification_method=null;
  await assert.rejects(app.service.rotate(issuerId,actor,"192.0.2.1"),/existing pending/);
  app.setPublished({id:app.owner.did_uri,verificationMethod:[],assertionMethod:[]});
  await app.service.activate(issuerId,app.key.id,actor,"192.0.2.1");
  assert.deepEqual(app.rpcCalls.at(-1),["phase4_activate_key",{p_issuer:issuerId,p_key:app.key.id,p_actor:actor,p_ip:"192.0.2.1"}]);
  app.tables.issuer_profiles.push({did:"did:web:another.example",verification_method:"did:web:another.example#1",active:true,owner_issuer_id:issuerId});
  await app.service.activate(issuerId,app.key.id,actor,"ip");
  app.setRpcError({message:"sensitive diagnostic"});
  await assert.rejects(app.service.activate(issuerId,app.key.id,actor,"ip"),/Managed key activation failed/);
});
test("public assertion validation rejects controller confusion, missing authorization and foreign key material",async t=>{
  const app=setup(t);
  const did=app.owner.did_uri,method=app.owner.verification_method;
  for(const entry of [
    {controller:"did:web:foreign.example",publicKeyMultibase:app.key.public_key_multibase},
    {controller:did,publicKeyMultibase:"zForeign"},
  ]) {
    app.setPublished({id:did,verificationMethod:[{id:method,...entry}],assertionMethod:[method]});
    await assert.rejects(app.assertPublishedKey(did,method,app.key.public_key_multibase),/does not match/);
  }
  app.setPublished({id:did,verificationMethod:[{id:method,controller:did,publicKeyMultibase:app.key.public_key_multibase}],assertionMethod:[]});
  await assert.rejects(app.assertPublishedKey(did,method,app.key.public_key_multibase),/does not match/);
  await assert.rejects(app.assertPublishedKey("did:key:zForeign",method,app.key.public_key_multibase),/does not match/);
});
test("database diagnostics are never propagated from key persistence",async t=>{
  const app=setup(t);
  app.setRpcError({message:"private_key=DO-NOT-EXPOSE",details:app.key.encrypted_private_key});
  await assert.rejects(app.service.rotate(issuerId,actor,"ip"),error=>{
    assert.ok(error instanceof crypto.IssuerKeyError);
    assert.ok(!error.message.includes("DO-NOT-EXPOSE"));return true;
  });

  await assert.rejects(app.service.download(issuerId,actor,"ip"),error=>{
    assert.ok(!error.message.includes("DO-NOT-EXPOSE"));return true;
  });
});

test("legacy status publication uses retained root-DID keys after managed rotation without confusing key history",async t=>{
  const app=setup(t);
  app.key.status="retired";
  app.tables.issuer_keys.push({...app.key,id:"older-key",key_version:0,fingerprint:"SHA256:older",
    verification_method:"did:web:issuer.example#old"});
  const context=await app.service.signerForStatus("did:web:issuer.example",issuerId);
  assert.equal(context.did,"did:web:issuer.example");
  assert.equal(context.verificationMethod,app.key.verification_method);
  assert.equal(context.publicKeyMultibase,app.key.public_key_multibase);
  app.tables.issuer_keys.push({...app.key,id:"foreign",issuer_id:"sibling",key_version:1,fingerprint:"SHA256:foreign"});
  await assert.rejects(app.service.signerForStatus("did:web:issuer.example"),/Ambiguous/);
});

test("managed status publication can use retained keys without enabling inactive credential signing",async t=>{
  const app=setup(t);app.key.status="retired";
  await assert.rejects(app.service.signer(issuerId),/no usable signing key/);
  const context=await app.service.signerForManagedStatus("did:web:verifiable.sg:organizations:academy");
  assert.equal(context.did,"did:web:verifiable.sg:organizations:academy");
  assert.equal(context.publicKeyMultibase,app.key.public_key_multibase);
});
