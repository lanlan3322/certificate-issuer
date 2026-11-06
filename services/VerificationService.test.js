const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const ts=require("typescript");
test("public verification telemetry uses server-only writes and rejects non-IP source metadata",async()=>{
  const calls=[];let failure=false;
  const admin={from:table=>({insert:payload=>({select:()=>({single:async()=>{
    calls.push({table,payload});return{data:{id:"log"},error:failure?new Error("Write failed"):null};
  }})})})};
  const module={exports:{}};
  new Function("require","module","exports",ts.transpileModule(readFileSync(`${__dirname}/VerificationService.ts`,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText)(name=>name==="../lib/supabase/server"?{getSupabaseAdmin:()=>admin,
    getSupabaseServerClient:()=>{throw new Error("Anonymous client cannot write telemetry");}}:require(name),module,module.exports);
  for(const sourceIp of [undefined,"unknown","credential-bearing-invalid-value","192.0.2.1","2001:db8::1"]) {
    await module.exports.VerificationService.log({verified:false,result:{found:false},sourceIp});
    assert.equal(calls.at(-1).payload.source_ip,require("node:net").isIP(sourceIp??"")?sourceIp:null);
    assert.equal(calls.at(-1).table,"verification_logs");
  }
  failure=true;
  await assert.rejects(module.exports.VerificationService.log({verified:true,result:{}}),/Write failed/);
});
