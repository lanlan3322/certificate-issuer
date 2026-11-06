const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const Module=require("node:module");
const path=require("node:path");
const ts=require("typescript");
function load(file,mocks={}) {
  const filename=path.resolve(__dirname,file),instance=new Module(filename,module);
  instance.filename=filename;instance.paths=Module._nodeModulePaths(path.dirname(filename));
  const native=instance.require.bind(instance);
  instance.require=name=>Object.hasOwn(mocks,name)?mocks[name]:native(name);
  instance._compile(ts.transpileModule(readFileSync(filename,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,filename);
  return instance.exports;
}
const billing=load("../lib/billing.ts");
const org="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002";
function snapshot(){return{
  subscription:{organization_id:org,plan:"starter",status:"active",version:1,billable:true,monthly_price_cents:4900},
  limits:{id:"starter",name:"Starter",issuer_limit:1,template_limit:5,certificate_limit:100},
  usage:{issuers:1,templates:4,certificatesIssued:80},request:null,
};}
test("usage warnings start at 80 percent and distinguish exact limits from unlimited Enterprise",()=>{
  const data=snapshot();
  assert.equal(billing.usageWarnings(data).length,3);
  assert.match(billing.usageWarnings(data)[0],/limit reached/);
  data.usage={issuers:0,templates:3,certificatesIssued:79};
  assert.deepEqual(billing.usageWarnings(data),[]);
  data.limits={issuer_limit:null,template_limit:null,certificate_limit:null};
  data.usage={issuers:10000,templates:10000,certificatesIssued:10000};
  assert.deepEqual(billing.usageWarnings(data),[]);
});
test("billing abstraction is provider-neutral, injectable and fails explicitly when payments are absent",async()=>{
  const {requireBillingProvider,BillingProviderUnavailableError}=load("../lib/billing-provider.ts");
  assert.throws(()=>requireBillingProvider([],"unconfigured"),BillingProviderUnavailableError);
  for(const id of ["stripe","hitpay","xfers","another-provider"]) {
    const adapter={id,createCheckout:async input=>({url:"https://provider.example/checkout",reference:input.idempotencyKey})};
    assert.strictEqual(requireBillingProvider([adapter],id),adapter);
    assert.equal((await requireBillingProvider([adapter],id).createCheckout({idempotencyKey:"request-1"})).reference,"request-1");
  }
});
function serviceSetup(){
  const calls=[];let failure=false,missing=false;
  const api=load("SubscriptionService.ts",{
    "../lib/billing":billing,
    "../lib/supabase/server":{getSupabaseAdmin:()=>({rpc:async(name,args)=>{
      calls.push([name,args]);return{data:missing?null:name==="subscription_platform_metrics"?{mrrCents:34800}:name==="subscription_directory"?{items:[],hasMore:false}:snapshot(),error:failure?{message:"secret-provider-url"}:null};
    }})},
  });
  return{...api,calls,fail:()=>failure=true,missing:()=>missing=true};
}
const assignment={plan:"enterprise",status:"active",version:1,billable:true,monthlyPriceCents:89900,renew:false,renewsAt:null,expiresAt:null};
test("subscription service validates contract payloads, returns safe errors and computes ARR from billable MRR",async()=>{
  const app=serviceSetup();
  assert.deepEqual(app.parseAssignment(assignment),assignment);
  for(const patch of [{plan:"fake"},{status:"trialing"},{version:0},{monthlyPriceCents:1.2},{monthlyPriceCents:2147483648},
    {billable:"true"},{renew:"yes"},{renewsAt:"invalid"},{renewsAt:"2026-02-31T00:00:00Z"},
    {renewsAt:"2026-01-01T00:00:00"},{expiresAt:undefined}]) {
    assert.throws(()=>app.parseAssignment({...assignment,...patch}),e=>e.status===400);
  }
  assert.equal((await app.SubscriptionService.snapshot(org)).subscription.plan,"starter");
  assert.deepEqual(await app.SubscriptionService.metrics(),{mrrCents:34800,arrCents:417600});
  assert.deepEqual(await app.SubscriptionService.directory(50),{items:[],hasMore:false});
  assert.deepEqual(app.calls.at(-1),["subscription_directory",{p_offset:50}]);
  await app.SubscriptionService.action(org,"actor","request",{plan:"enterprise"});
  assert.deepEqual(app.calls.at(-1),["subscription_admin_action",{p_org:org,p_actor:"actor",p_action:"request",p_payload:{plan:"enterprise"}}]);
  app.fail();
  for(const work of [()=>app.SubscriptionService.snapshot(org),()=>app.SubscriptionService.metrics(),()=>app.SubscriptionService.directory(0),()=>app.SubscriptionService.action(org,"actor","assign",assignment)]) {
    await assert.rejects(work(),e=>e.status>=400&&!e.message.includes("secret"));
  }
  const missing=serviceSetup();missing.missing();
  await assert.rejects(missing.SubscriptionService.snapshot(org),e=>e.status===404);
});
test("billing API rejects unauthorized roles/tenants, requires same-origin admin changes, and protects platform metrics",async()=>{
  const real=serviceSetup(),permissions=load("../lib/permissions.ts"),calls=[];
  let user={id:"actor",organizationId:org,roles:["organization_admin"]};
  const handler=load("../app/api/subscriptions/handler.ts",{
    "../../../lib/apiAuth":{authorize:async permission=>!user?{response:Response.json({error:"Unauthorized"},{status:401})}:
      !permissions.hasPermission(user,permission)?{response:Response.json({error:"Forbidden"},{status:403})}:{user}},
    "../../../lib/permissions":permissions,"../../../lib/billing":billing,
    "../../../services/SubscriptionService":{...real,SubscriptionService:{
      snapshot:async id=>{calls.push(["snapshot",id]);return snapshot();},
      metrics:async()=>({mrrCents:0,arrCents:0}),
      directory:async offset=>({items:[],hasMore:offset===0}),
      action:async(...args)=>calls.push(["action",...args]),
    }},
  });
  const request=(body,query="",origin="https://platform.example")=>new Request(`https://platform.example/api/subscriptions${query}`,{
    method:body===undefined?"GET":"POST",headers:{origin},...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  assert.equal((await handler.GET(request())).status,200);
  assert.equal((await handler.GET(request(undefined,`?organizationId=${other}`))).status,403);
  assert.equal((await handler.GET(request(undefined,"?scope=platform"))).status,403);
  assert.equal((await handler.GET(request(undefined,"?scope=directory"))).status,403);
  assert.equal((await handler.POST(request({action:"assign",...assignment}))).status,403);
  assert.equal((await handler.POST(request({action:"request",plan:"professional"}))).status,200);
  assert.deepEqual(calls.find(c=>c[0]==="action"),["action",org,"actor","request",{plan:"professional"}]);
  assert.equal((await handler.POST(request({action:"request",plan:"enterprise"},"","https://evil.example"))).status,403);
  assert.equal((await handler.POST(request({action:"request",plan:"fake"}))).status,400);
  assert.equal((await handler.POST(request({action:"request",padding:"x".repeat(5000)}))).status,413);
  assert.equal((await handler.GET(request(undefined,"?organizationId=invalid"))).status,400);
  user={...user,roles:["platform_admin"]};
  assert.equal((await handler.GET(request(undefined,"?scope=platform"))).status,200);
  assert.equal((await handler.GET(request(undefined,"?scope=directory&offset=50"))).status,200);
  assert.equal((await handler.GET(request(undefined,"?scope=directory&offset=-1"))).status,400);
  assert.equal((await handler.POST(request({action:"assign",...assignment},`?organizationId=${other}`))).status,200);
  assert.equal(calls.at(-2)[1],other);
  for(const role of ["viewer","issuer"]) {
    user={...user,roles:[role]};
    assert.equal((await handler.GET(request())).status,403);
    assert.equal((await handler.POST(request({action:"request",plan:"enterprise"}))).status,403);
  }
  user=null;assert.equal((await handler.GET(request())).status,401);
});
