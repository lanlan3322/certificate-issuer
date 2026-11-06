const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
const ethers=require("ethers");
function load(mocks) {
  const filename=path.join(__dirname,"document-store.ts"),instance=new Module(filename,module);
  instance.filename=filename;instance.paths=Module._nodeModulePaths(__dirname);
  instance.require=name=>Object.hasOwn(mocks,name)?mocks[name]:require(name);
  instance._compile(ts.transpileModule(readFileSync(filename,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText,filename);
  return instance.exports;
}
test("register, verify and revoke hashes remain isolated by issuance-time contract after changing active stores",async t=>{
  const before=process.env.DOCUMENT_STORE_PRIVATE_KEY;
  process.env.DOCUMENT_STORE_PRIVATE_KEY=`0x${"11".repeat(32)}`;
  t.after(()=>before===undefined?delete process.env.DOCUMENT_STORE_PRIVATE_KEY:process.env.DOCUMENT_STORE_PRIVATE_KEY=before);
  const records=new Map(),calls=[];
  class Provider{async getNetwork(){return{chainId:11155111n};}destroy(){}}
  class Contract{
    constructor(address){this.address=address.toLowerCase();if(!records.has(this.address))records.set(this.address,new Map());}
    async isIssued(hash){return records.get(this.address).has(hash);}
    async isRevoked(hash){assert.ok(await this.isIssued(hash));return records.get(this.address).get(hash);}
    async issue(hash){records.get(this.address).set(hash,false);calls.push(["issue",this.address,hash]);return{hash:"0xissued",wait:async(confirmations,timeout)=>{assert.equal(confirmations,1);assert.equal(timeout,60000);return{status:1};}};}
    async revoke(hash){records.get(this.address).set(hash,true);calls.push(["revoke",this.address,hash]);return{hash:"0xrevoked",wait:async()=>({status:1})};}
  }
  const api=load({ethers:{...ethers,JsonRpcProvider:Provider,Contract},
    "./constants":{DOCUMENT_STORE_CONFIG:{address:"0x1111111111111111111111111111111111111111"},NETWORKS:{sepolia:{chainId:11155111,rpcUrl:"https://public.example"}}}});
  const a={network:"sepolia",address:"0x3333333333333333333333333333333333333333"},b={...a,address:"0x4444444444444444444444444444444444444444"};
  const hash=`0x${"a".repeat(64)}`;
  assert.equal((await api.registerHash(hash,undefined,a,undefined,{required:true})).registered,true);
  assert.deepEqual(await api.checkHashRegistration(hash,a),{issued:true,revoked:false});
  assert.deepEqual(await api.checkHashRegistration(hash,b),{issued:false,revoked:false});
  await api.registerHash(hash,undefined,b,undefined,{required:true});
  await api.revokeHash(hash,a);
  assert.deepEqual(await api.checkHashRegistration(hash,a),{issued:true,revoked:true});
  assert.deepEqual(await api.checkHashRegistration(hash,b),{issued:true,revoked:false});
  assert.equal(calls.filter(c=>c[0]==="revoke")[0][1],a.address);
});
test("read-only Sepolia connection test checks chain, bytecode, ABI reads and server roles, never submitting a transaction",async t=>{
  const before=process.env.DOCUMENT_STORE_PRIVATE_KEY;
  process.env.DOCUMENT_STORE_PRIVATE_KEY=`0x${"11".repeat(32)}`;
  t.after(()=>before===undefined?delete process.env.DOCUMENT_STORE_PRIVATE_KEY:process.env.DOCUMENT_STORE_PRIVATE_KEY=before);
  const calls=[];let chain=11155111n,code="0x1234",permitted=true,issued=false;
  class Provider{
    async getNetwork(){return{chainId:chain};}
    async getCode(address){calls.push(["code",address]);return code;}
    destroy(){calls.push(["destroy"]);}
  }
  class Contract{
    constructor(address){calls.push(["contract",address]);}
    async isIssued(hash){calls.push(["read",hash]);return issued;}
    async hasRole(role,wallet){calls.push(["role",role,wallet]);return permitted;}
    async issue(){assert.fail("Connection test must not issue");}
    async revoke(){assert.fail("Connection test must not revoke");}
  }
  const api=load({ethers:{...ethers,JsonRpcProvider:Provider,Contract},
    "./constants":{DOCUMENT_STORE_CONFIG:{address:"0x1111111111111111111111111111111111111111"},NETWORKS:{sepolia:{chainId:11155111,rpcUrl:"https://public.example"}}}});
  const config={network:"sepolia",address:"0x3333333333333333333333333333333333333333"};
  const result=await api.testDocumentStoreConnection(config);
  assert.equal(result.signerAddress,new ethers.Wallet(process.env.DOCUMENT_STORE_PRIVATE_KEY).address);
  assert.deepEqual(calls.filter(c=>c[0]==="role").map(c=>c[1]),[ethers.id("ISSUER_ROLE"),ethers.id("REVOKER_ROLE")]);
  assert.equal(calls.at(-1)[0],"destroy");
  chain=1n;await assert.rejects(api.testDocumentStoreConnection(config),/Wrong chain/);chain=11155111n;
  code="0x";await assert.rejects(api.testDocumentStoreConnection(config),/No contract/);code="0x1234";
  permitted=false;await assert.rejects(api.testDocumentStoreConnection(config),/permissions/);permitted=true;
  issued="bad";await assert.rejects(api.testDocumentStoreConnection(config),/permissions/);issued=false;
  delete process.env.DOCUMENT_STORE_PRIVATE_KEY;
  const deployer=process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;
  delete process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;
  try{await assert.rejects(api.testDocumentStoreConnection(config),/not configured/);}
  finally{if(deployer!==undefined)process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY=deployer;}
  await assert.rejects(api.testDocumentStoreConnection({...config,network:"mainnet"}),/Sepolia only/);
});
