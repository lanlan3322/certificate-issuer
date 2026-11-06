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
const urls=load("../lib/managed-did-urls.ts");
const validator=load("../lib/managed-did.ts",{"./managed-did-urls":urls});
const crypto=load("../lib/issuer-key-crypto.ts");
const did=`${urls.MANAGED_DID_PREFIX}academy`;
const issuer="00000000-0000-4000-8000-000000000011";
const org="00000000-0000-4000-8000-000000000001";
const method=`${did}#issuer-${issuer}-key-1`;
function document() {
  const {generateKeyPairSync}=require("node:crypto");
  const key=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
  const publicKey=crypto.signingMultikey(key.privateKey,did,method).publicKeyMultibase;
  return{"@context":["https://www.w3.org/ns/did/v1","https://w3id.org/security/multikey/v1"],id:did,
    verificationMethod:[{id:method,type:"Multikey",controller:did,publicKeyMultibase:publicKey}],
    authentication:[method],assertionMethod:[method]};
}
function setup(rows={}) {
  const requests=[];
  let error=null;
  const client={from(table) {
    let columns,range=[0,999];const filters=[];
    const query={
      select(value){columns=value;return query;},eq(k,v){filters.push([k,v]);return query;},
      order(){return query;},range(from,to){range=[from,to];return query;},
      result(){
        requests.push({table,columns,range,filters});
        const data=(rows[table]??[]).filter(row=>filters.every(([k,v])=>row[k]===v)).slice(range[0],range[1]+1);
        return{data,error};
      },
      then(resolve,reject){return Promise.resolve(query.result()).then(resolve,reject);},
      async single(){const result=query.result();return{...result,data:result.data[0]??null};},
      async maybeSingle(){return query.single();},
    };return query;
  },async rpc(name,args){requests.push({name,args});return{error};}};
  const {ManagedDIDService:service,ManagedDIDError}=load("ManagedDIDService.ts",{
    "../lib/supabase/server":{getSupabaseAdmin:()=>client,getSupabaseServerClient:async()=>client},
    "../lib/managed-did":{...urls,...validator},
  });
  return{service,ManagedDIDError,requests,setError:value=>error=value};
}
test("managed document allowlist rejects secret-bearing fields, foreign relationships and malformed curve keys",()=>{
  const valid=document();assert.deepEqual(validator.validateManagedDocument(valid,did),valid);
  for(const mutate of [
    d=>d.private_key="secret",d=>d.encrypted_private_key="ciphertext",
    d=>d.verificationMethod[0].secretKeyMultibase="secret",d=>d.verificationMethod[0].publicKeyJwk={d:"secret"},
    d=>d.verificationMethod[0].controller="did:web:foreign.example",
    d=>d.verificationMethod[0].publicKeyMultibase="zpublic",
    d=>d.assertionMethod=[],d=>d.authentication=["did:web:foreign.example#key"],
    d=>d.verificationMethod.push(d.verificationMethod[0]),
  ]) {
    const invalid=structuredClone(valid);mutate(invalid);
    assert.throws(()=>validator.validateManagedDocument(invalid,did));
  }
  valid.authentication=[];assert.deepEqual(validator.validateManagedDocument(valid,did),valid);
  assert.equal(urls.managedDIDSlug(`${did}:foreign`),null);
  assert.equal(urls.managedDocumentURL(did),"https://verifiable.sg/organizations/academy/did.json");
  for(const page of [-1,1.5,2147483648])assert.throws(()=>urls.managedStatusURL(did,page,"revocation"));
});
test("public managed lookup selects only validated DID material and fails closed on missing/corrupt data",async()=>{
  const row={did,path_slug:"academy",did_document:document()};
  const app=setup({organization_dids:[row]});
  assert.deepEqual(await app.service.publicDocument("academy"),row.did_document);
  assert.equal(app.requests[0].columns,"did,did_document");
  await assert.rejects(app.service.publicDocument("../../secrets"),error=>error.status===404);
  await assert.rejects(app.service.publicDocument("unknown"),error=>error.status===404);
  row.did_document.encrypted_private_key="DO-NOT-EXPOSE";
  await assert.rejects(app.service.publicDocument("academy"),error=>error.status===503&&!error.message.includes("DO-NOT"));
  app.setError({message:"private_key=secret"});
  await assert.rejects(app.service.publicDocument("academy"),error=>!error.message.includes("secret"));
});
test("authenticated DID and method listings paginate beyond the Supabase row cap and preserve safe projections",async()=>{
  const doc=document();
  const app=setup({
    organization_dids:Array.from({length:501},(_,n)=>({id:String(n),organization_id:org,did,did_document:doc})),
    organization_verification_methods:Array.from({length:501},(_,n)=>({id:String(n),organization_id:org,issuer_id:issuer})),
  });
  assert.equal((await app.service.list(org)).length,501);
  assert.equal((await app.service.methods(org,issuer)).length,501);
  assert.equal(app.requests.length,4);
  for(const request of app.requests)assert.doesNotMatch(request.columns,/encrypted|private|export_claimed|\*/);
  assert.deepEqual(app.requests.map(r=>r.range),[[0,499],[500,999],[0,499],[500,999]]);
});
test("managed signing binding denies inactive methods/identities while historical status binding remains available",async()=>{
  const identity={id:"did-id",did,status:"active"};
  const binding={issuer_id:issuer,key_id:"key",organization_did_id:identity.id,verification_method:method,status:"active"};
  const app=setup({organization_dids:[identity],organization_verification_methods:[binding]});
  assert.deepEqual(await app.service.binding(issuer,"key"),{did,verificationMethod:method});
  await assert.rejects(app.service.binding("sibling","key"),error=>error.status===409);
  binding.status="inactive";await assert.rejects(app.service.binding(issuer,"key"),error=>error.status===409);
  identity.status="inactive";assert.equal((await app.service.binding(issuer,"key",true)).did,did);
  binding.status="active";await assert.rejects(app.service.binding(issuer,"key"),error=>error.status===409);
});
test("managed APIs enforce tenant scope, expose public-only documents, audit explicit downloads and never audit HEAD",async()=>{
  const {ManagedDIDError}=setup();
  let user={id:"actor",organizationId:org,roles:["issuer"]},deny=false;
  const calls=[],identity={organizationId:org,did,document:document()};
  const handler=load("../app/api/managed-dids/handler.ts",{
    "../../../lib/apiAuth":{authorize:async()=>deny?{response:Response.json({error:"Unauthorized"},{status:401})}:{user}},
    "../../../lib/permissions":{isPlatformAdmin:u=>u.roles.includes("platform-admin")},
    "../../../services/ManagedDIDService":{ManagedDIDError,ManagedDIDService:{
      list:async scope=>{calls.push(["list",scope]);return[identity];},
      methods:async(...args)=>{calls.push(["methods",...args]);return[];},
      auditDownload:async(...args)=>calls.push(["audit",...args]),
      publicDocument:async slug=>{assert.equal(slug,"academy");return identity.document;},
    }},
    "../../../services/StatusListService":{StatusListService:{publishManaged:async(...args)=>{calls.push(["status",...args]);return{issuer:did};}}},
    "../../../lib/managed-did-urls":urls,
    "../../../lib/did-publication":{publicDocumentHeaders:()=>({"Cache-Control":"public","Content-Type":"application/did+json",ETag:'"public"',"Access-Control-Allow-Origin":"*"})},
  });
  const req=(query="",method="GET")=>new Request(`https://untrusted.example/api/managed-dids${query}`,{method,headers:{origin:"https://untrusted.example"}});
  assert.equal((await handler.GET(req())).status,200);
  for(const scope of ["all","other-org"]) {
    assert.equal((await handler.GET(req(`?organizationId=${scope}`))).status,403);
    assert.equal((await handler.methodsGET(req(`?organizationId=${scope}`))).status,403);
  }
  assert.equal((await handler.methodsGET(req(`?issuerId=${issuer}`))).status,200);
  assert.deepEqual(calls.at(-1),["methods",org,issuer]);
  const download=await handler.downloadPOST(req("","POST"));
  assert.equal(download.headers.get("content-disposition"),'attachment; filename="did.json"');
  assert.deepEqual(await download.json(),identity.document);
  const auditCount=()=>calls.filter(c=>c[0]==="audit").length;
  assert.equal(auditCount(),1);
  await handler.GET(req("","HEAD"));assert.equal(auditCount(),1);
  assert.equal((await handler.downloadPOST(new Request("https://untrusted.example/api/managed-dids",{method:"POST"}))).status,403);
  user={...user,roles:["platform-admin"]};
  assert.equal((await handler.GET(req("?organizationId=all"))).status,200);assert.deepEqual(calls.at(-1),["list",undefined]);
  assert.equal((await handler.downloadPOST(req("?organizationId=all","POST"))).status,400);
  deny=true;assert.equal((await handler.GET(req())).status,401);
  const published=await handler.publicGET(req("?slug=academy"));
  assert.equal(published.headers.get("cache-control"),"public, max-age=0, must-revalidate");
  assert.deepEqual(await published.json(),identity.document);
  assert.equal((await handler.statusGET(req("?slug=academy&page=0&purpose=revocation"))).status,200);
  assert.deepEqual(calls.at(-1),["status",0,"revocation",did]);
  for(const query of ["?slug=academy&page=01&purpose=revocation","?slug=academy&page=2147483648&purpose=revocation",
    "?slug=academy:foreign&page=0&purpose=revocation","?slug=academy&page=0&purpose=invalid"]) {
    assert.equal((await handler.statusGET(req(query))).status,400);
  }
});
