const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const {NextResponse}=require("next/server");
const permissions=require("../../lib/permissions.ts");
const id="00000000-0000-4000-8000-000000000011",org="00000000-0000-4000-8000-000000000001";
class ForbiddenError extends Error{}
class IssuerKeyError extends Error{constructor(message,status=503){super(message);this.status=status;}}
function setup({role="organization_admin",foreign=false,sibling=false,loggedIn=true}={}) {
  const calls=[];
  const user={id:"actor",organizationId:org,roles:role==="issuer_admin"?["issuer"]: [role],issuerMemberships:
    ["issuer","issuer_admin","viewer"].includes(role)?[{issuerId:sibling?"sibling":id,role:role==="issuer"?"issuer_operator":role}]:[]};
  const owner={id,organizationId:foreign?"foreign":org,active:true,status:"active"};
  const dependencies={
    "next/server":{NextResponse},
    apiAuth:{authorize:async()=>loggedIn?{user}:{response:NextResponse.json({error:"Login required"},{status:401})},clientIp:()=>"192.0.2.1"},
    auth:{ForbiddenError},permissions,"issuer-key-crypto":{IssuerKeyError},
    "issuer-access":{requireIssuerAccess:async(_user,issuer,capability="read")=>{
      if(issuer!==id || !permissions.canAccessIssuer(user,owner,capability))throw new ForbiddenError();
      return owner;
    }},
    IssuerKeyService:{IssuerKeyService:{
      list:async(...args)=>{calls.push(["list",...args]);return[{id:"key",fingerprint:"SHA256:public"}];},
      rotate:async(...args)=>calls.push(["rotate",...args]),
      activate:async(...args)=>calls.push(["activate",...args]),
      download:async(...args)=>{calls.push(["download",...args]);return Buffer.from("PK-opaque-test-zip");},
    }},
  };
  function load(relative) {
    const code=ts.transpileModule(readFileSync(path.join(__dirname,relative),"utf8"),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
    }).outputText;
    const exports={};
    new Function("require","exports",code)(name=>{
      if(name==="../handler")return load("issuers/[id]/keys/handler.ts");
      const key=Object.keys(dependencies).find(key=>name.endsWith(`/${key}`)||name===key);
      assert.ok(key,`Unmocked ${name}`);return dependencies[key];
    },exports);
    return exports;
  }
  return{keys:load("issuers/[id]/keys/handler.ts"),download:load("issuers/[id]/keys/download/handler.ts"),calls};
}
function request(path="",method="GET",body,origin="https://verifiable.sg") {
  return new Request(`https://verifiable.sg/api/issuers/${id}/keys${path}`,{
    method,headers:{...(origin===null?{}:{Origin:origin}),"content-type":"application/json"},
    ...(body===undefined?{}:{body:typeof body==="string"?body:JSON.stringify(body)}),
  });
}
test("key APIs enforce management RBAC, same-tenant membership and fingerprint-only member access",async()=>{
  for(const [role,status] of [["platform_admin",200],["organization_admin",200],["issuer",403],["issuer_admin",403],["viewer",403]]) {
    const app=setup({role});
    const read=await app.keys.GET(request());
    assert.equal(read.status,200);
    assert.equal((await read.json()).canManage,status===200);
    assert.equal((await app.keys.POST(request("","POST",{action:"rotate"}))).status,status);
    assert.equal((await app.download.POST(request("/download","POST"))).status,status);
    assert.match(read.headers.get("cache-control"),/no-store/);
  }
  for(const options of [{foreign:true},{role:"issuer",sibling:true},{loggedIn:false}]) {
    const app=setup(options);
    assert.ok([401,403].includes((await app.keys.GET(request())).status));
    assert.ok([401,403].includes((await app.download.POST(request("/download","POST"))).status));
    assert.equal(app.calls.length,0);
  }
  const platform=setup({role:"platform_admin",foreign:true});
  assert.equal((await platform.keys.POST(request("","POST",{action:"rotate"}))).status,200);
});
test("key mutations reject cross-origin, missing origin, invalid actions and oversized input",async()=>{
  const app=setup();
  for(const origin of [null,"https://attacker.example"]) {
    assert.equal((await app.keys.POST(request("","POST",{action:"rotate"},origin))).status,403);
    assert.equal((await app.download.POST(request("/download","POST",undefined,origin))).status,403);
  }
  for(const body of ["invalid",{},null,{action:"activate",keyId:"../foreign"}]) {
    assert.equal((await app.keys.POST(request("","POST",body))).status,400);
  }
  assert.equal((await app.keys.POST(request("","POST","x".repeat(1025)))).status,413);
  assert.equal(app.calls.length,0);
});
test("private ZIP is POST-only, explicitly reauthorized and never returned as JSON",async()=>{
  const app=setup();
  assert.equal(app.download.GET,undefined);assert.equal(app.download.HEAD,undefined);
  assert.equal((await app.keys.GET(request())).status,200);
  assert.equal(app.calls.some(call=>call[0]==="download"),false);
  const response=await app.download.POST(request("/download","POST"));
  assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),"application/zip");
  assert.match(response.headers.get("content-disposition"),/attachment; filename="issuer-/);
  assert.match(response.headers.get("cache-control"),/no-store/);
  assert.match(response.headers.get("content-security-policy"),/sandbox/);
  assert.equal(await response.text(),"PK-opaque-test-zip");
  assert.equal(app.calls.filter(call=>call[0]==="download").length,1);
});
