const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const permissions = require("./permissions.ts");
const { canAccessIssuer, hasPermission } = permissions;
const issuer = { id: "issuer-a", organizationId: "org-a", status: "active", active: true };
const user = (role, memberships = [], org = "org-a") => ({
  roles: [role], issuerId: "issuer-a", organizationId: org, issuerMemberships: memberships,
});

test("issuer membership matrix grants only issuer-specific capabilities without elevating organization roles", () => {
  for (const [role, templates, operate] of [["issuer_admin",true,false],["issuer_operator",false,true],["viewer",false,false]]) {
    const principal = user("viewer",[{issuerId:issuer.id,role}]);
    assert.equal(canAccessIssuer(principal,issuer),true);
    assert.equal(canAccessIssuer(principal,issuer,"templates"),templates);
    assert.equal(canAccessIssuer(principal,issuer,"operate"),operate);
    assert.equal(canAccessIssuer(principal,issuer,"manage"),false);
    assert.equal(hasPermission(principal,"templates.manage"),templates);
    assert.equal(hasPermission(principal,"credentials.issue"),operate);
    assert.equal(hasPermission(principal,"issuers.manage"),false);
    assert.equal(canAccessIssuer(principal,{...issuer,id:"sibling"}),false);
    assert.equal(canAccessIssuer(principal,{...issuer,organizationId:"foreign"},"operate"),false);
  }
});

test("multiple assignments are independent; removal overrides legacy issuer role and active issuer ID", () => {
  const principal=user("issuer",[{issuerId:issuer.id,role:"viewer"},{issuerId:"sibling",role:"issuer_operator"}]);
  assert.equal(canAccessIssuer(principal,issuer,"operate"),false);
  assert.equal(canAccessIssuer(principal,{...issuer,id:"sibling"},"operate"),true);
  assert.equal(canAccessIssuer(user("issuer"),issuer,"operate"),false);
  assert.equal(hasPermission(user("issuer"),"credentials.issue"),false);
  assert.equal(canAccessIssuer(user("organization_admin"),issuer,"templates"),true);
  assert.equal(canAccessIssuer(user("organization_admin"),issuer,"operate"),false);
  assert.equal(canAccessIssuer(user("platform_admin"),{...issuer,organizationId:"foreign"},"operate"),true);
});

test("runtime access checks issuer and organization activity before elevated side effects",async()=>{
  class ForbiddenError extends Error {}
  let owner=issuer;
  let organization={status:"active",softDeletedAt:null};
  const module={exports:{}};
  const code=ts.transpileModule(readFileSync(`${__dirname}/issuer-access.ts`,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const dependencies={
    "./auth":{ForbiddenError},
    "./permissions":permissions,
    "../services/IssuerService":{IssuerService:{getById:async()=>owner}},
    "../services/OrganizationService":{OrganizationService:{getById:async()=>organization}},
  };
  new Function("require","exports",code)(name=>dependencies[name],module.exports);
  const check=module.exports.requireIssuerAccess;
  const principal=user("issuer",[{issuerId:issuer.id,role:"issuer_operator"}]);
  assert.equal((await check(principal,issuer.id,"operate",true)).id,issuer.id);
  for (const status of ["inactive","disabled","suspended","deleted"]) {
    owner={...issuer,status,active:false};
    await assert.rejects(check(principal,issuer.id,"operate",true),ForbiddenError);
  }
  owner=issuer;
  organization={status:"disabled",softDeletedAt:null};
  await assert.rejects(check(principal,issuer.id,"operate",true),ForbiddenError);
  organization={status:"active",softDeletedAt:"2026-01-01"};
  await assert.rejects(check(principal,issuer.id,"operate",true),ForbiddenError);
  owner=null;
  await assert.rejects(check(principal,issuer.id,"operate"),ForbiddenError);
});

test("issuer presentation reads only display labels, never interprets labels as verification",()=>{
  const {issuerPresentation}=require("./issuer-presentation.ts");
  assert.deepEqual(issuerPresentation({issuer:{name:"Legacy"}}),{
    issuerDisplayName:"Legacy",organizationDisplayName:"Not recorded",
  });
  assert.deepEqual(issuerPresentation({issuer:"did:web:issuer.test",credentialSubject:{
    issuerDisplayName:"Department",organizationDisplayName:"Organization",
  }}),{issuerDisplayName:"Department",organizationDisplayName:"Organization"});
  assert.equal(issuerPresentation(null).issuerDisplayName,"Not recorded");
});
