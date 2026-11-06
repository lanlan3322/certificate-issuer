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
class ManagedDIDError extends Error{constructor(message="Unavailable",status=503){super(message);this.status=status;}}
function setup() {
  let config=null,deploymentError=false,rpcError=false;
  const calls=[];
  const document={id:"did:web:academy.com",verificationMethod:[]};
  const client={from(table){
    const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,
      maybeSingle:async()=>({data:table==="self_managed_dids"?config:{issuer_id:"issuer",key_id:"key",verification_method:"did:web:verifiable.sg:organizations:academy#issuer-issuer-key-1"},error:null})};
    return query;
  },async rpc(name,args) {
    calls.push([name,args]);if(rpcError)return{error:{message:"private_key=secret"}};
    const {p_action:action,p_payload:payload}=args;
    if(action==="configure")config={organization_id:"org",domain:payload.domain,did:`did:web:${payload.domain}`,revision:1,
      validation_status:"pending",expected_document:document,selected:false};
    else if(action==="linkage") {
      Object.assign(config,{linkage_document:payload.document,linkage_expires_at:payload.expiresAt,revision:config.revision+1});
    }else if(action==="validate")config.validation_status=payload.valid?"valid":"invalid";
    else if(action==="self-managed")config.selected=true;
    else if(action==="managed")config.selected=false;
    return{error:null};
  }};
  const {SelfManagedDIDService:service}=load("SelfManagedDIDService.ts",{
    "../lib/supabase/server":{getSupabaseAdmin:()=>client,getSupabaseServerClient:async()=>client},
    "../lib/self-managed-did":{
      customerDomain:domain=>{if(domain.includes("/"))throw new Error("Invalid");return domain.toLowerCase();},
      validateCustomerDocument:value=>value,
      validateDomainLinkage:value=>{if(!value)throw new Error("Missing");},
      assertCustomerDeployment:async()=>{calls.push(["fetch"]);if(deploymentError)throw new Error("Untrusted response");},
    },
    "./ManagedDIDService":{ManagedDIDError},
    "./IssuerKeyService":{IssuerKeyService:{domainLinkage:async(...args)=>{
      calls.push(["linkage-sign",...args]);return{document:{"@context":"public",linked_dids:["signed"]},expiresAt:"2099-01-01"};
    }}},
  });
  return{service,calls,get config(){return config;},setDeploymentError:value=>deploymentError=value,setRpcError:value=>rpcError=value};
}
test("self-managed file generation signs once, saves revision, returns public-only documents and audits every explicit download",async()=>{
  const app=setup();
  await app.service.configure("org","actor","ACADEMY.COM");
  const first=await app.service.files("org","actor");
  assert.equal(first.did.id,"did:web:academy.com");assert.equal(first.revision,2);
  assert.equal(app.calls.filter(c=>c[0]==="linkage-sign").length,1);
  assert.deepEqual(app.calls.find(c=>c[0]==="linkage-sign").slice(1),["issuer","key","did:web:academy.com","did:web:academy.com#issuer-issuer-key-1"]);
  const second=await app.service.files("org","actor");
  assert.deepEqual(first,second);assert.equal(app.calls.filter(c=>c[0]==="linkage-sign").length,1);
  assert.equal(app.calls.filter(c=>c[1]?.p_action==="download").length,2);
  assert.doesNotMatch(JSON.stringify(first),/PRIVATE|encrypted|secretKey/);
  app.setRpcError(true);await assert.rejects(app.service.action("org","actor","validate",2),error=>error.status===409&&!error.message.includes("secret"));
});
test("self-managed selection verifies deployment first; failures are persisted explicitly and do not silently select managed",async()=>{
  const app=setup();
  await assert.rejects(app.service.configure("org","actor","https://academy.com"),error=>error.status===400);
  await app.service.configure("org","actor","academy.com");await app.service.files("org","actor");
  await app.service.select("org","actor","self-managed");
  assert.equal(app.config.selected,true);assert.equal(app.config.validation_status,"valid");
  app.setDeploymentError(true);
  await assert.rejects(app.service.validate("org","actor"),error=>error.status===422&&!error.message.includes("Untrusted"));
  assert.equal(app.config.selected,true);assert.equal(app.config.validation_status,"invalid");
  await assert.rejects(app.service.select("org","actor","self-managed"),error=>error.status===422);
  await app.service.select("org","actor","managed");assert.equal(app.config.selected,false);
});
test("self-managed API enforces authenticated tenant scope, admin mutations, same origin, bounded requests and validation rate limits",async()=>{
  let user={id:"actor",organizationId:"org",roles:["issuer"]},denied=false;
  const calls=[];
  class RateLimitError extends Error{}
  const permissions=load("../lib/permissions.ts");
  const handler=load("../app/api/self-managed-dids/handler.ts",{
    "../../../lib/apiAuth":{authorize:async()=>denied?{response:Response.json({error:"Unauthorized"},{status:401})}:{user}},
    "../../../lib/permissions":permissions,
    "../../../services/ManagedDIDService":{ManagedDIDError},
    "../../../lib/auth":{RateLimitError,enforceRateLimit:async(...args)=>calls.push(["rate",...args])},
    "../../../services/SelfManagedDIDService":{SelfManagedDIDService:Object.fromEntries(["get","configure","files","validate","select"].map(name=>[
      name,async(...args)=>{calls.push([name,...args]);return name==="files"?{did:{id:"public"},configuration:{linked_dids:["public"]}}:null;},
    ]))},
  });
  const request=(body,query="",headers={origin:"https://platform.example"})=>new Request(`https://platform.example/api/self-managed-dids${query}`,{
    method:body===undefined?"GET":"POST",headers, ...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  assert.equal((await handler.GET(request())).status,200);
  assert.equal((await handler.GET(request(undefined,"?organizationId=other"))).status,403);
  assert.equal((await handler.POST(request({action:"configure",domain:"academy.com"}))).status,403);
  user={...user,roles:["organization_admin"]};
  assert.equal((await handler.POST(request({action:"configure",domain:"academy.com"}))).status,200);
  assert.equal((await handler.POST(request({action:"validate"},"",{}))).status,403);
  assert.equal((await handler.POST(request({action:"files"}))).status,200);
  assert.equal((await handler.POST(request({action:"validate"}))).status,200);
  assert.deepEqual(calls.find(c=>c[0]==="rate"),["rate","did-validation:organization","org",10,5]);
  assert.equal((await handler.POST(request({action:"self-managed"}))).status,200);
  assert.deepEqual(calls.find(c=>c[0]==="select"),["select","org","actor","self-managed"]);
  assert.equal((await handler.POST(request({action:"bad"}))).status,400);
  assert.equal((await handler.POST(request({action:"configure",domain:"a".repeat(3000)}))).status,413);
  denied=true;assert.equal((await handler.GET(request())).status,401);assert.equal((await handler.POST(request({action:"validate"}))).status,401);
});
