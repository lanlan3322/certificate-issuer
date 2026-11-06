const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {renderToStaticMarkup}=require("react-dom/server");
const ts=require("typescript");
const source=readFileSync(`${__dirname}/OrganizationDIDPanel.tsx`,"utf8");
const javascript=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const did="did:web:verifiable.sg:organizations:academy";
const identity={id:"did-id",organizationId:"org",did,status:"active",method:"did:web",hostingMode:"managed",createdAt:"2026-01-01",
  document:{"@context":[],id:did,verificationMethod:[{id:`${did}#issuer-issuer-id-key-1`}],authentication:[],assertionMethod:[]}};
function setup({platform=false,identities=[identity],fail=false}={}) {
  const states=[],dependencies=[],effects=[],requests=[],events=[];
  let stateIndex=0,effectIndex=0;
  const react={
    useState(initial){const n=stateIndex++;if(!(n in states))states[n]=initial;return[states[n],value=>states[n]=value];},
    useEffect(effect,deps){
      const n=effectIndex++;
      if(!dependencies[n]||deps.some((value,i)=>value!==dependencies[n][i])){dependencies[n]=deps;effects.push(effect);}
    },
  };
  const module={exports:{}};
  new Function("require","module","exports","fetch","URL","document",javascript)(name=>{
    if(name==="react")return react;
    if(name==="./SelfManagedDIDPanel")return{default:()=>null};
    if(name==="./WorkspaceSession")return{useWorkspaceSession:()=>({user:{id:"actor",organizationId:"org",roles:platform?["platform-admin"]:["issuer"]}})};
    if(name==="../lib/permissions")return{isPlatformAdmin:user=>user.roles.includes("platform-admin")};
    if(name==="../lib/site")return{withBasePath:path=>`/portal${path}`};
    if(name==="../lib/managed-did-urls")return{managedDocumentURL:()=>"https://verifiable.sg/organizations/academy/did.json"};
    return require(name);
  },module,module.exports,async(url,options)=>{
    requests.push({url,options});
    if(fail)return Response.json({error:"Managed DID unavailable."},{status:503});
    if(url.includes("/download"))return Response.json(identity.document);
    if(url.includes("/methods"))return Response.json({methods:[{id:"method",verification_method:`${did}#issuer-issuer-id-key-1`,key_fingerprint:"SHA256:public",key_version:1,status:"active"}]});
    return Response.json({identities});
  },{createObjectURL:()=>{events.push("create");return"blob:did";},revokeObjectURL:()=>events.push("revoke")},
  {createElement:()=>({click:()=>events.push("click"),remove:()=>events.push("remove")}),body:{appendChild:()=>events.push("append")}});
  const render=()=>{stateIndex=0;effectIndex=0;return module.exports.default();};
  return{requests,events,states,render,html:()=>renderToStaticMarkup(render()),
    async mount(){for(let n=0;n<3;n++){render();effects.splice(0).forEach(effect=>effect());await new Promise(setImmediate);}},
    async download(){find(render(),node=>node.type==="button").props.onClick();await new Promise(setImmediate);}};
}
function find(node,predicate) {
  if(!node||typeof node!=="object")return;
  if(Array.isArray(node))return node.map(item=>find(item,predicate)).find(Boolean);
  return predicate(node)?node:find(node.props?.children,predicate);
}
test("managed DID panel is read-only, scoped, raw-viewable and downloads only after explicit action",async()=>{
  const app=setup();await app.mount();
  assert.equal(app.requests.length,2);
  assert.match(app.requests[0].url,/\?organizationId=org$/);
  const html=app.html();
  for(const label of [did,"SHA256:public","managed","did:web","Raw DID document","Download did.json","read-only"])assert.ok(html.includes(label));
  assert.doesNotMatch(html,/<input|<textarea|Rotate|PRIVATE KEY|encrypted_private_key/);
  assert.equal(app.requests.some(request=>request.options.method==="POST"),false);
  await app.download();
  assert.match(app.requests.at(-1).url,/\/download\?organizationId=org$/);
  assert.equal(app.requests.at(-1).options.method,"POST");
  assert.deepEqual(app.events,["create","append","click","remove","revoke"]);
});
test("platform can select organization DIDs while missing identities and failures are explicit",async()=>{
  const platform=setup({platform:true});await platform.mount();
  assert.match(platform.requests[0].url,/organizationId=all$/);assert.match(platform.html(),/<select/);
  const empty=setup({identities:[]});await empty.mount();
  assert.match(empty.html(),/No managed DID is available/);assert.equal(empty.requests.length,1);
  const failed=setup({fail:true});await failed.mount();
  assert.match(failed.html(),/role="alert"/);assert.match(failed.html(),/Managed DID unavailable/);
});
