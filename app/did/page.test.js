const test=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {renderToStaticMarkup}=require("react-dom/server");
const {createElement}=require("react");
const ts=require("typescript");
const source=readFileSync(`${__dirname}/page.tsx`,"utf8");
const exportsUnderTest={};
new Function("require","exports",ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
}).outputText)(name=>name==="../../lib/site"?{withBasePath:url=>url}:require(name),exportsUnderTest);
test("existing identity registry does not offer new DIDs or tenant-selected signing secrets",()=>{
  const html=renderToStaticMarkup(createElement(exportsUnderTest.default));
  assert.match(html,/Issuer identity registry/);
  assert.match(html,/New DID configuration is not available/);
  assert.ok(!source.includes("keyReference"));
  assert.ok(!source.includes('method: "POST"'));
  assert.ok(!source.includes("submitCreate"));
  const payload=source.slice(source.indexOf("function profilePayload"),source.indexOf("function formatDate"));
  assert.ok(!payload.includes("did:"));assert.ok(!payload.includes("verificationMethod:"));
  assert.match(source,/method: "PATCH"/);
});
