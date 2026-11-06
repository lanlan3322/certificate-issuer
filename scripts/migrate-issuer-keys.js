// Operator-only: reuse project TypeScript without installing a runtime dependency.
const {readFileSync}=require("node:fs");
const ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>{
  const code=ts.transpileModule(readFileSync(filename,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText;
  module._compile(code,filename);
};
const {IssuerKeyMigrationService}=require("../services/IssuerKeyMigrationService.ts");
const {IssuerKeyError}=require("../lib/issuer-key-crypto.ts");

async function main() {
  const args=process.argv.slice(2);
  if(args.some(arg=>!["--apply","--rewrap"].includes(arg))) throw new IssuerKeyError("Use --apply and optionally --rewrap.");
  const actor=process.env.ISSUER_KEY_MIGRATION_ACTOR_ID;
  if(!actor || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor)) throw new IssuerKeyError("An operator platform-admin application user ID is required.");
  const apply=args.includes("--apply");
  if(args.includes("--rewrap")) {
    const count=await IssuerKeyMigrationService.rewrap(actor,apply);
    console.log(`${apply?"Rewrapped":"Validated rewrap for"} ${count} issuer keys.`);
  } else {
    const plan=await IssuerKeyMigrationService.plan();
    if(apply && plan.length) await IssuerKeyMigrationService.apply(actor,plan);
    console.log(`${apply?"Provisioned":"Validated provisioning for"} ${plan.length} issuer keys.`);
  }
  if(!apply) console.log("Preflight only. No database changes made. Use --apply during the controlled rollout.");
}
main().catch(error=>{
  console.error(error instanceof IssuerKeyError ? error.message : "Issuer-key migration failed. Review server configuration; no secret diagnostics are printed.");
  process.exitCode=1;
});
