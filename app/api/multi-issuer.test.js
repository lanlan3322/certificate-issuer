const test = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync}=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const permissions=require("../../lib/permissions.ts");
const {NextResponse}=require("next/server");
const org="00000000-0000-4000-8000-000000000001";
const issuerId="00000000-0000-4000-8000-000000000011";
const userId="00000000-0000-4000-8000-000000000021";

function setup(relative,role="organization_admin",ownerOrg=org,recordIssuer=issuerId) {
  const calls=[];
  class ForbiddenError extends Error {}
  const user={id:userId,organizationId:org,issuerId,roles:[role],issuerMemberships:
    role==="issuer" ? [{issuerId,role:"issuer_operator"}] : []};
  const issuer={id:issuerId,organizationId:ownerOrg,name:"Issuer",displayName:"Issuer",active:true,status:"active"};
  const service={
    getById:async(id)=>({...issuer,id}),
    create:async(input)=>{calls.push(["create",input]);return{id:issuerId,...input};},
    update:async(...args)=>{calls.push(["update",...args]);return{...issuer,...args[2]};},
    updateStatus:async(...args)=>{calls.push(["status",...args]);return{...issuer,status:args[1]};},
  };
  const dependencies={
    "next/server":{NextResponse},
    apiAuth:{
      authorize:async(permission)=>permission&&!permissions.hasPermission(user,permission)
        ?{response:NextResponse.json({error:"Forbidden"},{status:403})}:{user},
      errorResponse:(error,fallback)=>NextResponse.json({error:fallback},{status:error instanceof ForbiddenError ? 403 : 400}),
    },
    permissions,
    "issuer-input":require("../../lib/issuer-input.ts"),
    IssuerService:{IssuerService:service,IssuerInvitationError:class extends Error{}},
    auth:{ForbiddenError},
    OrganizationService:{OrganizationService:{getById:async()=>({status:"active",softDeletedAt:null})}},
    CredentialService:{CredentialService:{
      get:async()=>({id:userId,issuerId:recordIssuer,organizationId:ownerOrg}),
      findByExternalId:async()=>({id:userId,issuerId:recordIssuer,organizationId:ownerOrg}),
    }},
    RevocationService:{
      CredentialNotFoundError:class extends Error{},DocumentStoreRevocationError:class extends Error{},RevocationStateError:class extends Error{},
      RevocationService:{apply:async(input)=>{calls.push(["revoke",input]);return{credentialId:userId};}},
    },
    AuditService:{AuditService:{record:async()=>{}}},
    IssuerMemberService:{IssuerMemberService:{
      list:async()=>[],
      save:async(...args)=>{calls.push(["save",...args]);return{};},
      remove:async(...args)=>{calls.push(["remove",...args]);},
    }},
    site:{withBasePath:url=>url},
    "supabase/server":{},
  };
  function load(file) {
    const filename=path.join(__dirname,file);
    const module={exports:{}};
    const code=ts.transpileModule(readFileSync(filename,"utf8"),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    }).outputText;
    new Function("require","exports",code)(name=>{
      if(name==="../handler")return load("issuers/handler.ts");
      if(name.endsWith("/issuer-access"))return load("../../lib/issuer-access.ts");
      const key=Object.keys(dependencies).find(key=>name.endsWith(`/${key}`)||name===key);
      assert.ok(key,`Unmocked dependency ${name}`);
      return dependencies[key];
    },module.exports);
    return module.exports;
  }
  return{handler:load(relative),calls};
}
const request=(path,method,body)=>new Request(`https://verifiable.sg/api/${path}`,{
  method,...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)}),
});

test("revocation API resolves the stored issuer and enforces sibling isolation before revocation",async()=>{
  const sibling="00000000-0000-4000-8000-000000000012";
  for(const [role,owner,status] of [["issuer",issuerId,200],["issuer",sibling,403],["platform_admin",sibling,200],["organization_admin",issuerId,403],["viewer",issuerId,403]]) {
    const app=setup("revocation/handler.ts",role,org,owner);
    const response=await app.handler.POST(request("revocation","POST",{credentialId:userId,action:"revoke",reason:"Test",issuerId:sibling}));
    assert.equal(response.status,status,`${role} targeting ${owner}`);
    if(status===200)assert.equal(app.calls.find(call=>call[0]==="revoke")[1].issuerId,owner);
    else assert.equal(app.calls.length,0);
  }
});

test("issuer API validates create/edit metadata, lifecycle and organization ownership",async()=>{
  const app=setup("issuers/handler.ts");
  const body={name:"Issuer",displayName:"Department",slug:"department",contactEmail:"issuer@example.com",website:"https://example.test",description:"Team"};
  assert.equal((await app.handler.POST(request("issuers","POST",body))).status,201);
  assert.equal(app.calls[0][1].organizationId,org);
  assert.equal(app.calls[0][1].displayName,"Department");
  assert.equal((await app.handler.POST(request("issuers","POST",{...body,organizationId:userId}))).status,403);
  for(const bad of [{name:""},{slug:"bad code"},{contactEmail:"invalid"},{logoUrl:"javascript:alert(1)"},{status:"other"}]) {
    assert.equal((await app.handler.POST(request("issuers","POST",{...body,...bad}))).status,400);
  }
  assert.equal((await app.handler.PATCH(request("issuers","PATCH",{id:issuerId,displayName:"Edited",status:"inactive"}))).status,200);
  assert.equal(app.calls.at(-1)[3].displayName,"Edited");
  assert.equal((await app.handler.PATCH(request("issuers","PATCH",{id:issuerId,status:"deleted"}))).status,403);
  const foreign=setup("issuers/handler.ts","organization_admin",userId);
  assert.equal((await foreign.handler.PATCH(request("issuers","PATCH",{id:issuerId,name:"Attack"}))).status,404);
  assert.equal(foreign.calls.length,0);
  for(const role of ["issuer","viewer"]) {
    const denied=setup("issuers/handler.ts",role);
    assert.equal((await denied.handler.POST(request("issuers","POST",body))).status,403);
  }
});

test("issuer members API gates assignments, roles and removal before accessing persistence",async()=>{
  const app=setup("issuers/[id]/members/handler.ts");
  const url=`issuers/${issuerId}/members`;
  for(const role of ["issuer_admin","issuer_operator","viewer"]) {
    assert.equal((await app.handler.POST(request(url,"POST",{userId,role}))).status,201);
    assert.deepEqual(app.calls.at(-1),["save",issuerId,userId,role]);
  }
  assert.equal((await app.handler.POST(request(url,"POST",{userId,role:"platform_admin"}))).status,400);
  assert.equal((await app.handler.DELETE(request(`${url}?userId=${userId}`,"DELETE"))).status,200);
  assert.deepEqual(app.calls.at(-1),["remove",issuerId,userId]);
  const denied=setup("issuers/[id]/members/handler.ts","issuer");
  assert.equal((await denied.handler.POST(request(url,"POST",{userId,role:"issuer_admin"}))).status,403);
  assert.equal(denied.calls.length,0);
  const foreign=setup("issuers/[id]/members/handler.ts","organization_admin",userId);
  assert.equal((await foreign.handler.GET(request(url,"GET"))).status,404);
});

test("issuer deletion is a platform-only soft lifecycle change, never physical deletion",async()=>{
  for(const role of ["platform_admin","organization_admin","issuer","viewer"]) {
    const app=setup("issuers/[id]/handler.ts",role);
    const response=await app.handler.DELETE(request(`issuers/${issuerId}`,"DELETE"));
    assert.equal(response.status,role==="platform_admin"?200:403);
    if(role==="platform_admin")assert.deepEqual(app.calls,[["status",issuerId,"deleted",org]]);
    else assert.equal(app.calls.length,0);
  }
});
