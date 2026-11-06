const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {renderToStaticMarkup}=require("react-dom/server");
const ts=require("typescript");
const javascript=ts.transpileModule(readFileSync(`${__dirname}/SelfManagedDIDPanel.tsx`,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const did="did:web:academy.com",method=`${did}#issuer-issuer-id-key-1`;
function fixture() {
  return{domain:"academy.com",did,selected:false,revision:2,validation_status:"pending",checked_at:null,
    validation_message:null,linkage_expires_at:"2099-01-01",expected_document:{id:did,
      verificationMethod:[{id:method,publicKeyMultibase:"zPublicOnly"}],authentication:[method],assertionMethod:[method]}};
}
function find(node,predicate) {
  if(!node||typeof node!=="object")return;
  if(Array.isArray(node))return node.map(item=>find(item,predicate)).find(Boolean);
  return predicate(node)?node:find(node.props?.children,predicate);
}
function setup({admin=true,configured=true}={}) {
  const states=[],refs=[],dependencies=[],effects=[],requests=[],events=[];
  let stateIndex=0,refIndex=0,effectIndex=0,configuration=configured?fixture():null,accepted=true,fail=false;
  const react={
    useState(initial){const n=stateIndex++;if(!(n in states))states[n]=initial;return[states[n],value=>states[n]=value];},
    useRef(initial){const n=refIndex++;return refs[n]??(refs[n]={current:initial});},
    useCallback(callback){return callback;},
    useEffect(effect,deps){
      const n=effectIndex++;
      if(!dependencies[n]||deps.some((value,i)=>value!==dependencies[n][i])){dependencies[n]=deps;effects.push(effect);}
    },
  };
  const module={exports:{}};
  new Function("require","module","exports","fetch","URL","document","window",javascript)(name=>{
    if(name==="react")return react;
    if(name==="./WorkspaceSession")return{useWorkspaceSession:()=>({user:{id:"actor",organizationId:"org",roles:admin?["organization_admin"]:["viewer"]}})};
    if(name==="../lib/permissions")return{isPlatformAdmin:()=>false,normalizeRoles:roles=>roles};
    if(name==="../lib/site")return{withBasePath:path=>`/portal${path}`};
    return require(name);
  },module,module.exports,async(url,options)=>{
    requests.push({url,options});
    if(options.method==="POST") {
      const payload=JSON.parse(options.body);
      if(fail)return Response.json({error:"Deployment validation failed."},{status:422});
      if(payload.action==="configure")configuration=fixture();
      if(payload.action==="self-managed")configuration.selected=true;
      if(payload.action==="managed")configuration.selected=false;
      if(payload.action==="validate")configuration.validation_status="valid";
      if(payload.action==="files")return Response.json({did:configuration.expected_document,configuration:{linked_dids:["signed-public"]}});
      return Response.json({success:true});
    }
    return Response.json({configuration});
  },{createObjectURL:blob=>{events.push(["create",blob]);return"blob:did";},revokeObjectURL:()=>events.push(["revoke"])},
  {createElement:()=>({download:"",click(){events.push(["click",this.download]);},remove:()=>events.push(["remove"])}),
    body:{appendChild:()=>events.push(["append"])}},{confirm:()=>accepted});
  const render=()=>{stateIndex=0;refIndex=0;effectIndex=0;return module.exports.default({organizationId:"org"});};
  const flush=()=>new Promise(setImmediate);
  return{requests,events,render,html:()=>renderToStaticMarkup(render()),
    setAccepted:value=>accepted=value,setFailure:value=>fail=value,
    async mount(){for(let n=0;n<2;n++){render();effects.splice(0).forEach(effect=>effect());await flush();}},
    async click(label){const button=find(render(),node=>node.type==="button"&&node.props.children===label);
      assert.ok(button,`Missing button: ${label}`);button.props.onClick();await flush();},
    async configure(domain){
      find(render(),node=>node.type==="input").props.onChange({target:{value:domain}});
      find(render(),node=>node.type==="form").props.onSubmit({preventDefault(){}});
      await flush();
    }};
}
test("self-managed portal configures the domain, shows public multi-issuer methods and requires explicit confirmed mode switching",async()=>{
  const app=setup({configured:false});await app.mount();
  assert.match(app.html(),/Customer domain/);assert.match(app.html(),/cannot be renamed/);
  assert.equal(app.requests.filter(r=>r.options.method==="POST").length,0);
  await app.configure("academy.com");
  assert.equal(JSON.parse(app.requests.find(r=>r.options.method==="POST").options.body).domain,"academy.com");
  for(const label of ["Overview","Download Files","Validation Status","Issuer Methods",did,method,"zPublicOnly",
    "https://academy.com/.well-known/did.json","https://academy.com/.well-known/did-configuration.json"]) {
    assert.ok(app.html().includes(label),label);
  }
  app.setAccepted(false);await app.click("Validate and use Self-Managed DID");
  assert.equal(app.requests.filter(r=>r.options.method==="POST").length,1);
  app.setAccepted(true);await app.click("Validate and use Self-Managed DID");
  assert.match(app.html(),/New issuance uses: Self-Managed DID/);
  await app.click("Use Managed DID");assert.match(app.html(),/New issuance uses: Managed DID/);
});
test("self-managed public files download only on explicit action and validation failures are visible without success fallback",async()=>{
  const app=setup();await app.mount();
  await app.click("Download customer did.json");await app.click("Download did-configuration.json");
  assert.deepEqual(app.events.filter(e=>e[0]==="click").map(e=>e[1]),["did.json","did-configuration.json"]);
  const contents=await Promise.all(app.events.filter(e=>e[0]==="create").map(e=>e[1].text()));
  assert.match(contents[0],/zPublicOnly/);assert.match(contents[1],/signed-public/);
  assert.doesNotMatch(contents.join(""),/PRIVATE KEY|encrypted_private_key|secretKey/);
  await app.click("Validate deployment");assert.match(app.html(),/Last result: <strong>valid/);
  app.setFailure(true);await app.click("Validate deployment");
  assert.match(app.html(),/role="alert"/);assert.match(app.html(),/Deployment validation failed/);
});
test("organization viewers see public configuration and deployment state but cannot mutate or download via the portal",async()=>{
  const app=setup({admin:false});await app.mount();
  assert.match(app.html(),/Issuer Methods/);assert.match(app.html(),/zPublicOnly/);
  assert.doesNotMatch(app.html(),/<button|<input|<form/);
  assert.equal(app.requests.filter(r=>r.options.method==="POST").length,0);
  const empty=setup({admin:false,configured:false});await empty.mount();
  assert.match(empty.html(),/organization administrator can configure/);
});
