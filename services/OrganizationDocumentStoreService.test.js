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
const storeId="00000000-0000-4000-8000-000000000051",address="0x1111111111111111111111111111111111111111";
function setup() {
  const rows=[{id:storeId,organization_id:"org",network:"sepolia",contract_address:address,status:"inactive",
    approved_by:"platform",connection_status:"untested"}],calls=[];
  let connectionError=false,databaseError=false;
  const client={from(table){
    const filters=[];let range=[0,999];
    const query={
      select:()=>query,eq:(k,v)=>{filters.push([k,v]);return query;},order:()=>query,
      range:(from,to)=>{range=[from,to];return query;},
      result:()=>({data:rows.filter(r=>filters.every(([k,v])=>r[k]===v)).slice(range[0],range[1]+1),error:databaseError?{message:"private-rpc-url"}:null}),
      maybeSingle:async()=>{const result=query.result();return{...result,data:result.data[0]??null};},
      then:(resolve,reject)=>Promise.resolve(query.result()).then(resolve,reject),
    };return query;
  },rpc:async(name,args)=>{
    calls.push([name,args]);
    if(args.p_action==="test")rows.find(r=>r.id===args.p_store).connection_status=args.p_payload.ok?"ok":"error";
    if(args.p_action==="activate")rows.find(r=>r.id===args.p_store).status="active";
    return{error:databaseError?{message:"secret"}:null};
  }};
  const {OrganizationDocumentStoreService:service,OrganizationDocumentStoreError}=load("OrganizationDocumentStoreService.ts",{
    "../lib/supabase/server":{getSupabaseAdmin:()=>client,getSupabaseServerClient:async()=>client},
    "../lib/document-store":{getDefaultDocumentStoreConfig:()=>({network:"sepolia",address:"0x2222222222222222222222222222222222222222"}),
      testDocumentStoreConnection:async config=>{calls.push(["probe",config]);if(connectionError)throw new Error("private-rpc-url");return{signerAddress:"0xpublic-wallet"};}},
  });
  return{service,OrganizationDocumentStoreError,rows,calls,setConnectionError:v=>connectionError=v,setDatabaseError:v=>databaseError=v};
}
test("organization store add validates Sepolia/address, preserves legacy selection and rejects claiming platform store",async()=>{
  const app=setup();
  assert.equal(await app.service.active("org"),null);
  for(const [network,value,status] of [["mainnet",address,400],["sepolia","bad",400],
    ["sepolia","0x0000000000000000000000000000000000000000",400],["sepolia","0x2222222222222222222222222222222222222222",409]]) {
    await assert.rejects(app.service.add("org","actor",network,value),e=>e.status===status);
  }
  await app.service.add("org","actor","sepolia",address);
  assert.deepEqual(app.calls.at(-1),["organization_store_action",{p_org:"org",p_actor:"actor",p_action:"add",p_store:null,p_payload:{network:"sepolia",address}}]);
  assert.equal(await app.service.active("other"),null);
  app.setDatabaseError(true);
  await assert.rejects(app.service.active("org"),e=>e.status===503&&!e.message.includes("private"));
});
test("connection tests persist explicit safe results; activation retests and failed active stores never fall back",async()=>{
  const app=setup();
  await app.service.activate("org","actor",storeId);
  assert.deepEqual(await app.service.active("org"),{id:storeId,address,network:"sepolia"});
  assert.deepEqual(app.calls.slice(0,3).map(c=>c[0]==="probe"?"probe":c[1].p_action),["probe","test","activate"]);
  app.setConnectionError(true);
  await assert.rejects(app.service.test("org","actor",storeId),e=>e.status===422&&!e.message.includes("private"));
  assert.equal(app.rows[0].status,"active");assert.equal(app.rows[0].connection_status,"error");
  await assert.rejects(app.service.active("org"),e=>e.status===409);
  await assert.rejects(app.service.test("other","actor",storeId),e=>e.status===404);
  app.rows[0].approved_by=null;
  await assert.rejects(app.service.active("org"),e=>e.status===409);
});
test("organization store listing paginates beyond default row caps",async()=>{
  const app=setup();
  app.rows.push(...Array.from({length:1100},(_,i)=>({...app.rows[0],id:`store-${i}`})));
  assert.equal((await app.service.list("org")).length,1101);
});
test("Document Store API enforces admin mutations, tenant scope, platform approval, same origin and bounded/rate-limited requests",async()=>{
  const {OrganizationDocumentStoreError}=setup();
  let user={id:"actor",organizationId:"org",roles:["viewer"]},denied=false,rateLimited=false;
  const calls=[];
  class RateLimitError extends Error{}
  const handler=load("../app/api/organization-document-stores/handler.ts",{
    "../../../lib/apiAuth":{authorize:async()=>denied?{response:Response.json({error:"Unauthorized"},{status:401})}:{user}},
    "../../../lib/permissions":load("../lib/permissions.ts"),
    "../../../lib/auth":{RateLimitError,enforceRateLimit:async(...args)=>{if(rateLimited)throw new RateLimitError();calls.push(["rate",...args]);}},
    "../../../services/OrganizationDocumentStoreService":{OrganizationDocumentStoreError,
      OrganizationDocumentStoreService:Object.fromEntries(["list","add","action","test","activate"].map(name=>[name,async(...args)=>{calls.push([name,...args]);return[];}]))},
  });
  const request=(body,query="",headers={origin:"https://platform.example"})=>new Request(`https://platform.example/api/organization-document-stores${query}`,{
    method:body===undefined?"GET":"POST",headers,...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  assert.equal((await handler.GET(request())).status,200);
  assert.equal((await handler.GET(request(undefined,"?organizationId=other"))).status,403);
  assert.equal((await handler.POST(request({action:"add",network:"sepolia",address}))).status,403);
  user={...user,roles:["organization_admin"]};
  assert.equal((await handler.POST(request({action:"add",network:"sepolia",address}))).status,200);
  assert.equal((await handler.POST(request({action:"approve",storeId}))).status,403);
  assert.equal((await handler.POST(request({action:"test",storeId},"",{}))).status,403);
  assert.equal((await handler.POST(request({action:"test",storeId}))).status,200);
  assert.deepEqual(calls.find(c=>c[0]==="rate"),["rate","organization-store:test","org",10,5]);
  assert.equal((await handler.POST(request({action:"activate",storeId}))).status,200);
  assert.equal((await handler.POST(request({action:"deactivate",storeId}))).status,200);
  assert.equal((await handler.POST(request({action:"activate",storeId:"bad"}))).status,400);
  assert.equal((await handler.POST(request({action:"add",address:"a".repeat(3000)}))).status,413);
  rateLimited=true;assert.equal((await handler.POST(request({action:"test",storeId}))).status,429);
  user={...user,roles:["platform_admin"]};
  assert.equal((await handler.POST(request({action:"approve",storeId},"?organizationId=other"))).status,200);
  assert.deepEqual(calls.find(c=>c[0]==="action"&&c[2]==="actor"&&c[3]==="approve"),["action","other","actor","approve",storeId]);
  denied=true;assert.equal((await handler.GET(request())).status,401);
});
