const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createPrivateKey, createPublicKey, sign, verify, generateKeyPairSync } = require("node:crypto");
const ts = require("typescript");
const mod = {exports:{}};
new Function("require","module","exports",ts.transpileModule(
  readFileSync(`${__dirname}/issuer-key-crypto.ts`,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText)(require,mod,mod.exports);
const crypto = mod.exports;
const master = Buffer.alloc(32,17).toString("base64");
const scope = {organizationId:"org-a",issuerId:"issuer-a",keyVersion:1,encryptionKeyId:"v1"};
function env(t) {
  const saved = {...process.env};
  process.env.ISSUER_KEY_ENCRYPTION_KEY=master;
  delete process.env.ISSUER_KEY_ENCRYPTION_KEY_ID;
  delete process.env.ISSUER_KEY_ENCRYPTION_PREVIOUS_KEYS;
  t.after(()=>{process.env=saved;});
}
test("P-256 keys are encrypted, canonical, interoperable and never stored as plaintext",async(t)=>{
  env(t);
  const key=crypto.provisionKey("org-a","issuer-a",1);
  const privateKey=crypto.privateKeyObject(key.encryptedPrivateKey,scope);
  const pem=privateKey.export({format:"pem",type:"pkcs8"});
  const derived=crypto.publicMaterial(privateKey);
  assert.deepEqual(derived,{publicKey:key.publicKey,publicKeyMultibase:key.publicKeyMultibase,fingerprint:key.fingerprint});
  assert.match(key.fingerprint,/^SHA256:/);
  assert.ok(!key.encryptedPrivateKey.includes("PRIVATE KEY"));
  const nonce2=crypto.provisionKey("org-a","issuer-a",1,privateKey);
  assert.notEqual(key.encryptedPrivateKey,nonce2.encryptedPrivateKey);
  assert.equal(key.fingerprint,nonce2.fingerprint);
  const signer=crypto.signingMultikey(privateKey,"did:web:issuer.example","did:web:issuer.example#key-1");
  const {from}=await import("@digitalbazaar/ecdsa-multikey");
  const multikey=await from({id:signer.verificationMethod,controller:signer.did,type:"Multikey",
    publicKeyMultibase:signer.publicKeyMultibase,secretKeyMultibase:signer.secretKeyMultibase});
  const data=Buffer.from("issuer-owned message");
  assert.ok(await multikey.verifier().verify({data,signature:await multikey.signer().sign({data})}));
  const sig=sign("sha256",data,createPrivateKey(pem));
  assert.ok(verify("sha256",data,createPublicKey(key.publicKey),sig));
  assert.equal(crypto.publicMaterial(crypto.importMultikey(signer.secretKeyMultibase,signer.publicKeyMultibase)).fingerprint,key.fingerprint);
});
test("GCM rejects tampering, foreign tenants, versions, masters and malformed envelopes",t=>{
  env(t);
  const key=crypto.provisionKey("org-a","issuer-a",1);
  for(const field of ["organizationId","issuerId","keyVersion","encryptionKeyId"]) {
    assert.throws(()=>crypto.decryptPrivateKey(key.encryptedPrivateKey,{...scope,[field]:field==="keyVersion"?2:"other"}),crypto.IssuerKeyError);
  }
  for(const field of ["iv","tag","data"]) {
    const changed=JSON.parse(key.encryptedPrivateKey);
    const bytes=Buffer.from(changed[field],"base64");bytes[0]^=1;changed[field]=bytes.toString("base64");
    assert.throws(()=>crypto.decryptPrivateKey(JSON.stringify(changed),scope),/authentication failed/);
  }
  assert.throws(()=>crypto.decryptPrivateKey("{}",scope),/authentication failed/);
  process.env.ISSUER_KEY_ENCRYPTION_KEY=Buffer.alloc(32,9).toString("base64");
  assert.throws(()=>crypto.decryptPrivateKey(key.encryptedPrivateKey,scope),/authentication failed/);
  for(const value of ["","bad",Buffer.alloc(31).toString("base64"),master.slice(0,-1)+"A"]) {
    process.env.ISSUER_KEY_ENCRYPTION_KEY=value;
    assert.throws(()=>crypto.provisionKey("org-a","issuer-a",1),crypto.IssuerKeyError);
  }
});
test("master key IDs permit old-key reads without changing signing identity",t=>{
  env(t);
  const first=crypto.provisionKey("org-a","issuer-a",1);
  process.env.ISSUER_KEY_ENCRYPTION_KEY_ID="v2";
  process.env.ISSUER_KEY_ENCRYPTION_KEY=Buffer.alloc(32,42).toString("base64");
  process.env.ISSUER_KEY_ENCRYPTION_PREVIOUS_KEYS=JSON.stringify({v1:master});
  const privateKey=crypto.privateKeyObject(first.encryptedPrivateKey,scope);
  const rewrapped=crypto.provisionKey("org-a","issuer-a",1,privateKey);
  assert.equal(rewrapped.encryptionKeyId,"v2");
  assert.equal(rewrapped.fingerprint,first.fingerprint);
  assert.doesNotThrow(()=>crypto.privateKeyObject(rewrapped.encryptedPrivateKey,{...scope,encryptionKeyId:"v2"}));
  delete process.env.ISSUER_KEY_ENCRYPTION_PREVIOUS_KEYS;
  assert.throws(()=>crypto.privateKeyObject(first.encryptedPrivateKey,scope),crypto.IssuerKeyError);
});
test("legacy import rejects mismatched public/private pairs and incompatible curves",t=>{
  env(t);
  const first=crypto.provisionKey("org-a","issuer-a",1);
  const second=crypto.provisionKey("org-a","issuer-a",1);
  const secret=crypto.signingMultikey(crypto.privateKeyObject(first.encryptedPrivateKey,scope),"did:web:a.example","did:web:a.example#1");
  assert.throws(()=>crypto.importMultikey(secret.secretKeyMultibase,second.publicKeyMultibase),/import failed/);
  assert.throws(()=>crypto.importMultikey("plain","plain"),/import failed/);
  assert.throws(()=>crypto.provisionKey("org-a","issuer-a",1,generateKeyPairSync("ec",{namedCurve:"secp256k1"}).privateKey),/Only P-256/);
});
