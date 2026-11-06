const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const ts=require("typescript");
const {renderToStaticMarkup}=require("react-dom/server");
const javascript=ts.transpileModule(readFileSync(`${__dirname}/OrganizationDocumentStores.tsx`,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
}).outputText;
function setup({role="organization_admin",fail=false}={}) {
  const states=[],refs=[],deps=[],effects=[],requests=[],confirmations=[];
  let stateIndex=0,refIndex=0,effectIndex=0;
  const user={id:"actor",organizationId:"org",roles:[role]};
  const stores=[{id:"store",network:"sepolia",contract_address:"0x1111111111111111111111111111111111111111",
    status:"pending",approved_by:null,connection_status:"untested",checked_at:null,created_at:"2026-01-01"}];
  const react={
    useState(initial){const n=stateIndex++;if(!(n in states))states[n]=initial;return[states[n],value=>states[n]=value];},
    useRef(initial){const n=refIndex++;return refs[n]??(refs[n]={current:initial});},
    useEffect(effect,values){const n=effectIndex++;if(!deps[n]||values.some((v,i)=>v!==deps[n][i])){deps[n]=values;effects.push(effect);}},
  };
  const module={exports:{}};
  new Function("require","module","exports","fetch","window",javascript)(name=>{
    if(name==="react")return react;
    if(name==="./WorkspaceSession")return{useWorkspaceSession:()=>({user})};
    if(name==="../lib/permissions")return{isPlatformAdmin:u=>u.roles.includes("platform_admin"),normalizeRoles:roles=>roles};
    if(name==="../lib/site")return{withBasePath:url=>url};
    return require(name);
  },module,module.exports,async(url,options={})=>{
    requests.push({url,options});
    if(url==="/api/organizations")return Response.json({organizations:[{id:"org",displayName:"Organization"}]});
    if(fail)return Response.json({error:"Store unavailable."},{status:503});
    if(options.method==="POST") {
      const {action}=JSON.parse(options.body),store=stores[0];
      if(action==="approve"){store.approved_by="platform";store.status="inactive";}
      if(action==="test")store.connection_status="ok";
      if(action==="activate")store.status="active";
      if(action==="deactivate")store.status="inactive";
    }
    return Response.json({stores});
  },{confirm:message=>{confirmations.push(message);return true;}});
  const render=()=>{stateIndex=refIndex=effectIndex=0;return module.exports.default();};
  const tick=()=>new Promise(setImmediate);
  return{requests,confirmations,stores,render,html:()=>renderToStaticMarkup(render()),
    async mount(){for(let n=0;n<3;n++){render();effects.splice(0).forEach(effect=>effect());await tick();}},
    async click(label){const button=find(render(),node=>node.type==="button"&&text(node)===label);assert.ok(button,label);button.props.onClick();await tick();},
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
test("Document Store portal scopes reads and keeps issuer/viewer access read-only",async()=>{
  for(const role of ["viewer","issuer"]) {
    const app=setup({role});await app.mount();
    assert.match(app.requests[0].url,/organizationId=org$/);
    const html=app.html();
    assert.match(html,/No active organization store/);assert.match(html,/Sepolia only/);
    assert.doesNotMatch(html,/<form|<input|<button|private_key|PRIVATE KEY/);
    assert.equal(app.requests.some(r=>r.options.method==="POST"),false);
  }
});
test("organization admins test/activate stores but only platform admins approve ownership",async()=>{
  const org=setup();await org.mount();
  assert.doesNotMatch(org.html(),/Approve ownership assignment/);
  await org.click("Test Connection");
  assert.equal(JSON.parse(org.requests.at(-1).options.body).action,"test");
  assert.match(org.html(),/No transaction was sent/);
  const app=setup({role:"platform_admin"});await app.mount();
  assert.equal(app.requests[0].url,"/api/organizations");
  assert.match(app.html(),/<select/);
  await app.click("Approve ownership assignment");
  assert.match(app.confirmations[0],/not ownership proof/);
  await app.click("Test Connection");
  await app.click("Set Active Store");
  assert.match(app.html(),/Status: active/);
  await app.click("Deactivate Store");
  assert.match(app.html(),/Status: inactive/);
  assert.deepEqual(app.requests.filter(r=>r.options.method==="POST").map(r=>JSON.parse(r.options.body).action),
    ["approve","test","activate","deactivate"]);
});
test("Document Store portal surfaces service failures without success messages",async()=>{
  const app=setup({fail:true});await app.mount();
  assert.match(app.html(),/role="alert"/);assert.match(app.html(),/Store unavailable/);
  assert.doesNotMatch(app.html(),/configuration updated/);
});
