const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {renderToStaticMarkup}=require("react-dom/server");
const ts=require("typescript");
const source=readFileSync(`${__dirname}/BillingDashboard.tsx`,"utf8");
const javascript=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
function setup({role="organization_admin",fail=false,metricsOnly=false,directoryOnly=false}={}) {
  const states=[],refs=[],deps=[],effects=[],requests=[],confirmations=[],selected=[];
  let stateIndex=0,refIndex=0,effectIndex=0;
  const user={id:"actor",organizationId:"org",roles:[role]};
  const data={
    subscription:{organization_id:"org",plan:"starter",status:"active",billable:true,monthly_price_cents:4900,version:1,
      renews_at:"2030-01-01",renewed_at:null,expires_at:null,grandfathered:false},
    limits:{name:"Starter",issuer_limit:1,template_limit:5,certificate_limit:100},
    usage:{issuers:1,templates:4,certificatesIssued:80,issuersCreated:1,templatesCreated:4,storageBytes:2048},
    warnings:["Certificates this UTC month: 80/100 - approaching plan limit."],request:null,
  };
  const react={
    useState(initial){const n=stateIndex++;if(!(n in states))states[n]=initial;return[states[n],value=>states[n]=value];},
    useRef(initial){const n=refIndex++;return refs[n]??(refs[n]={current:initial});},
    useEffect(effect,values){const n=effectIndex++;if(!deps[n]||values.some((v,i)=>v!==deps[n][i])){deps[n]=values;effects.push(effect);}},
  };
  const permissions={isPlatformAdmin:u=>u?.roles.includes("platform_admin"),
    hasPermission:(u,p)=>!!u&&(u.roles.includes("platform_admin")||p==="billing.read"&&u.roles.includes("organization_admin"))};
  const module={exports:{}};
  new Function("require","module","exports","fetch","window",javascript)(name=>{
    if(name==="react")return react;
    if(name==="./WorkspaceSession")return{useWorkspaceSession:()=>({user})};
    if(name==="../lib/permissions")return permissions;
    if(name==="../lib/billing")return{PLAN_IDS:["starter","professional","enterprise"],formatSGD:cents=>`SGD ${(cents/100).toFixed(2)}`};
    if(name==="../lib/site")return{withBasePath:url=>url};
    return require(name);
  },module,module.exports,async(url,options={})=>{
    requests.push({url,options});
    if(fail)return Response.json({error:"Billing unavailable."},{status:503});
    if(url.includes("scope=directory"))return Response.json({items:[{
      organizationId:"org",organizationName:"Organization",plan:"starter",status:"active",renewsAt:null,expiresAt:null,
      billable:true,monthlyPriceCents:4900,requestedPlan:"professional",
    }],hasMore:false});
    if(url.includes("scope=platform"))return Response.json({metrics:{
      mrrCents:34800,arrCents:417600,organizations:2,activeIssuers:3,credentialsIssued:8,certificatesThisMonth:4,
      verificationVolume:12,subscriptions:2,activeSubscriptions:2,pendingRequests:1,
    }});
    if(url==="/api/organizations")return Response.json({organizations:[{id:"org",displayName:"Organization"}]});
    if(options.method==="POST") {
      const body=JSON.parse(options.body);
      if(body.action==="request")data.request={requested_plan:body.plan,created_at:"2026-01-01"};
      else {data.subscription.plan=body.plan;data.subscription.version++;data.limits.name=body.plan;}
    }
    return Response.json(data);
  },{confirm:message=>{confirmations.push(message);return true;}});
  const render=()=>{
    stateIndex=refIndex=effectIndex=0;
    return metricsOnly?module.exports.BillingMetricsPanel():directoryOnly?
      module.exports.SubscriptionDirectoryPanel({onSelect:id=>selected.push(id)}):module.exports.default();
  };
  const tick=()=>new Promise(setImmediate);
  return{requests,confirmations,data,render,selected,
    html:()=>renderToStaticMarkup(render()),
    async mount(){for(let n=0;n<3;n++){render();effects.splice(0).forEach(effect=>effect());await tick();}},
    select(label,value){
      const node=find(render(),node=>node.type==="label"&&text(node).startsWith(label));
      const field=find(node,n=>n.type==="select");assert.ok(field,label);
      field.props.onChange({target:{value}});
    },
    async submit(){find(render(),node=>node.type==="form").props.onSubmit({preventDefault(){}});await tick();},
  };
}
function find(node,predicate) {
  if(!node||typeof node!=="object")return;
  if(Array.isArray(node))return node.map(item=>find(item,predicate)).find(Boolean);
  return predicate(node)?node:find(node.props?.children,predicate);
}
function text(node) {
  if(typeof node==="string")return node;
  if(Array.isArray(node))return node.map(text).join("");
  return node?.props?text(node.props.children):"";
}
test("organization admins see current plan, renewal, exact quotas, storage scope and warnings, but request rather than assign",async()=>{
  const app=setup();await app.mount();
  assert.match(app.requests[0].url,/organizationId=org$/);
  const html=app.html();
  for(const label of ["Starter plan","80","100","approaching plan limit","Next renewal","2,048","not total database or object storage","no carry-forward","Online payments are not connected"])assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/Apply subscription|Billable contract|Subscription &amp; revenue overview/);
  app.select("Plan","professional");await app.submit();
  assert.deepEqual(JSON.parse(app.requests.at(-1).options.body),{action:"request",plan:"professional"});
  assert.equal(app.data.subscription.plan,"starter");
  assert.match(app.html(),/current plan is unchanged/);
});
test("platform admins assign versioned contracts after confirmation without claiming a payment",async()=>{
  const app=setup({role:"platform_admin"});await app.mount();
  assert.match(app.html(),/Assign subscription/);assert.match(app.html(),/Organization/);
  app.select("Plan","professional");await app.submit();
  const body=JSON.parse(app.requests.at(-1).options.body);
  assert.equal(body.action,"assign");assert.equal(body.plan,"professional");
  assert.equal(body.version,1);assert.equal(body.monthlyPriceCents,29900);
  assert.match(app.confirmations[0],/No payment will be collected/);
  assert.match(app.html(),/Subscription updated. No payment collected/);
});
test("billing roles and service failures are explicit and never rendered as zero revenue",async()=>{
  for(const role of ["viewer","issuer"]) {
    const app=setup({role});await app.mount();
    assert.match(app.html(),/administrator access is required/);
    assert.equal(app.requests.length,0);
  }
  const failed=setup({fail:true});await failed.mount();
  assert.match(failed.html(),/role="alert"/);assert.match(failed.html(),/Billing unavailable/);
  const metrics=setup({metricsOnly:true});await metrics.mount();
  assert.match(metrics.html(),/SGD 348.00/);assert.match(metrics.html(),/SGD 4176.00/);
  assert.match(metrics.html(),/not cash collected/);
  const unavailable=setup({metricsOnly:true,fail:true});await unavailable.mount();
  assert.match(unavailable.html(),/Billing unavailable/);assert.doesNotMatch(unavailable.html(),/SGD 0.00/);
});
test("platform subscription directory exposes requests, review actions and pagination state",async()=>{
  const app=setup({directoryOnly:true});await app.mount();
  assert.match(app.requests[0].url,/scope=directory&offset=0$/);
  const html=app.html();
  for(const label of ["Subscriptions &amp; plan requests","professional","SGD 49.00","Organization","Page 1"])assert.ok(html.includes(label),label);
  assert.match(html,/scope="col"/);assert.match(html,/aria-label="Review Organization"/);
  find(app.render(),node=>node.type==="button"&&node.props["aria-label"]==="Review Organization").props.onClick();
  assert.deepEqual(app.selected,["org"]);
  const failed=setup({directoryOnly:true,fail:true});await failed.mount();
  assert.match(failed.html(),/Billing unavailable/);
});
