const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync,existsSync}=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
const {generateKeyPairSync,verify,createPublicKey}=require("node:crypto");
function load(file,mocks={}) {
  const filename=path.resolve(__dirname,file),instance=new Module(filename,module);
  instance.filename=filename;instance.paths=Module._nodeModulePaths(path.dirname(filename));
  const native=instance.require.bind(instance);
  instance.require=name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    const candidate=path.resolve(path.dirname(filename),`${name}.ts`);
    return name.startsWith(".")&&existsSync(candidate)?load(candidate,mocks):native(name);
  };
  instance._compile(ts.transpileModule(readFileSync(filename,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText,filename);
  return instance.exports;
}
const api=load("self-managed-did.ts");
const crypto=load("issuer-key-crypto.ts");
function fixture() {
  const did="did:web:verifiable.sg:organizations:academy",keys=[],methods=[];
  for(const n of [1,2]) {
    const key=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
    const id=`${did}#issuer-00000000-0000-4000-8000-${String(n).padStart(12,"0")}-key-1`;
    methods.push({id,type:"Multikey",controller:did,publicKeyMultibase:crypto.signingMultikey(key.privateKey,did,id).publicKeyMultibase});
    keys.push(key);
  }
  const managed={"@context":["https://www.w3.org/ns/did/v1","https://w3id.org/security/multikey/v1"],
    id:did,verificationMethod:methods,authentication:methods.map(m=>m.id),assertionMethod:methods.map(m=>m.id)};
  return{keys,managed,customer:api.customerDocument(managed,"academy.com")};
}
test("customer DID generation remaps many owned issuer keys without private material and preserves retained methods",()=>{
  const {managed,customer}=fixture();
  assert.equal(customer.id,"did:web:academy.com");assert.equal(customer.verificationMethod.length,2);
  assert.deepEqual(api.validateCustomerDocument(customer,"academy.com"),customer);
  assert.equal(customer.verificationMethod[0].publicKeyMultibase,managed.verificationMethod[0].publicKeyMultibase);
  assert.doesNotMatch(JSON.stringify(customer),/PRIVATE|secretKey|encrypted|verifiable.sg/);
  for(const mutate of [
    d=>d.private_key="secret",d=>d.verificationMethod[0].secretKeyMultibase="secret",
    d=>d.verificationMethod[0].controller="did:web:foreign.com",d=>d.assertionMethod=[],
    d=>d.verificationMethod[0].publicKeyMultibase="zbad",d=>d.id="did:web:foreign.com",
  ]) {
    const invalid=structuredClone(customer);mutate(invalid);
    assert.throws(()=>api.validateCustomerDocument(invalid,"academy.com"));
  }
  customer.authentication=[];assert.equal(api.validateCustomerDocument(customer,"academy.com").assertionMethod.length,2);
});
test("domain input rejects scheme/path/port, IP/local names and platform domains",()=>{
  assert.equal(api.customerDomain("  Academy.COM "),"academy.com");
  for(const domain of ["https://academy.com","academy.com/path","academy.com:443","127.0.0.1","[::1]",
    "localhost","a.local","a.internal","a.test","a.invalid","verifiable.sg","tenant.verifiable.sg",
    "academy.com@evil.com","academy.com?x","academy.com#x","*.academy.com","a..com","academy.1a","academy.a",
    `a${"b".repeat(64)}.com`]) {
    assert.throws(()=>api.customerDomain(domain),domain);
  }
});
test("DIF domain linkage JWT is ES256 signed with the issuer-owned public method, has standard claims and rejects expiry/tampering",()=>{
  const {keys,customer}=fixture(),now=new Date("2026-01-01T00:00:00Z");
  const result=api.createDomainLinkage(keys[0].privateKey,customer.id,customer.verificationMethod[0].id,now);
  api.validateDomainLinkage(result.document,customer,now.getTime()+1000);
  const jwt=result.document.linked_dids[0],parts=jwt.split(".");
  const header=JSON.parse(Buffer.from(parts[0],"base64url")),claims=JSON.parse(Buffer.from(parts[1],"base64url"));
  assert.deepEqual(Object.keys(header).sort(),["alg","kid"]);assert.equal(header.alg,"ES256");
  assert.deepEqual(Object.keys(claims).sort(),["exp","iss","nbf","sub","vc"]);
  assert.equal(claims.vc.credentialSubject.origin,"https://academy.com");
  assert.ok(verify("sha256",Buffer.from(parts.slice(0,2).join(".")),{key:createPublicKey(keys[0].privateKey),dsaEncoding:"ieee-p1363"},Buffer.from(parts[2],"base64url")));
  assert.throws(()=>api.validateDomainLinkage(result.document,customer,new Date(result.expiresAt).getTime()),/expiry/);
  assert.throws(()=>api.validateDomainLinkage(result.document,customer,now.getTime()-1000),/expiry/);
  const bad={...result.document,linked_dids:[`${parts[0]}.${parts[1]}.${Buffer.alloc(64).toString("base64url")}`]};
  assert.throws(()=>api.validateDomainLinkage(bad,customer,now.getTime()+1000),/signature/);
  assert.throws(()=>api.validateDomainLinkage(result.document,api.customerDocument(fixture().managed,"foreign.com"),now.getTime()+1000));
});
test("deployment validation fetches both canonical HTTPS files, rejects redirects, mismatched material and invalid linkage",async()=>{
  const {keys,customer}=fixture();
  const linkage=api.createDomainLinkage(keys[0].privateKey,customer.id,customer.verificationMethod[0].id).document;
  const calls=[];let deployed=customer,configuration=linkage,redirect=false;
  const safe=load("safe-document-loader.ts");
  const injected=load("self-managed-did.ts",{"./safe-document-loader":{
    createSafeDocumentLoader:(base,contexts,dids,options)=>safe.createSafeDocumentLoader(base,contexts,dids,{
      ...options,lookupAll:async()=>[{address:"93.184.216.34",family:4}],
      fetchJson:async(url,address)=>{
        calls.push([url.href,address]);
        if(redirect)return{redirect:"https://another.com/.well-known/did.json"};
        return{document:url.pathname.endsWith("/did.json")?deployed:configuration};
      },
    }),
  }});
  const config={domain:"academy.com",expected_document:customer,linkage_document:linkage};
  await injected.assertCustomerDeployment(config);
  assert.deepEqual(calls.map(c=>c[0]),["https://academy.com/.well-known/did.json","https://academy.com/.well-known/did-configuration.json"]);
  redirect=true;await assert.rejects(injected.assertCustomerDeployment(config),/Redirects/);redirect=false;
  deployed=api.customerDocument(fixture().managed,"academy.com");
  await assert.rejects(injected.assertCustomerDeployment(config),/latest/);deployed=customer;
  configuration={linked_dids:[]};await assert.rejects(injected.assertCustomerDeployment(config),/configuration/);
});
