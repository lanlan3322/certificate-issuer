const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(client) {
  const filename = path.resolve(__dirname, "IssuerService.ts");
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(__dirname);
  instance.require = (name) => {
    if(name==="node:crypto")return{randomUUID:()=>"new-issuer-id"};
    if(name==="../lib/issuer-key-crypto")return{
      IssuerKeyError:class extends Error{},
      provisionKey:(org,issuer,version)=>({encryptedPrivateKey:"ciphertext",publicKey:"public",fingerprint:"fingerprint",issuer,org,version}),
    };
    assert.equal(name, "../lib/supabase/server");
    return { getSupabaseAdmin: () => client };
  };
  instance._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return instance.exports;
}

const input = { organizationId: "org", name: "Academy", slug: "academy", contactEmail: "new@example.com" };
function setup({ reservationError = null, inviteError = null, linkError = null } = {}) {
  const calls = [];
  const row = { id: "issuer", organization_id: "org", name: "Academy", slug: "academy",
    contact_email: input.contactEmail, status: "active", created_at: "now" };
  const client = {
    async rpc(name, args) {
      calls.push([name, args]);
      return name === "phase3_prepare_invitation"
        ? { data: { issuer: row, user_id: "profile" }, error: reservationError }
        : { error: linkError };
    },
    auth: { admin: { async inviteUserByEmail(email, options) {
      calls.push(["invite", email, options]);
      return { data: { user: { id: "auth-id" } }, error: inviteError };
    } } },
  };
  return { ...load(client), calls };
}

test("invitation reserves selected role, sends email, and links the returned auth identity", async () => {
  for (const role of ["issuer-admin", "issuer-operator", "organization_admin", "issuer", "viewer"]) {
    const { IssuerService, calls } = setup();
    const issuer = await IssuerService.createWithInvitation(input, role, "actor", "https://example.com/issuer/?mode=reset");
    assert.equal(issuer.id, "issuer");
    assert.equal(calls[0][1].p_role, role);
    assert.equal(calls[0][1].p_key.encryptedPrivateKey,"ciphertext");
    assert.equal(calls[0][1].p_input.id,"new-issuer-id");
    assert.deepEqual(calls[1], ["invite", input.contactEmail, { redirectTo: "https://example.com/issuer/?mode=reset" }]);
    assert.equal(calls[2][1].p_auth_user_id, "auth-id");
    assert.equal(calls[2][1].p_user_id, "profile");
  }
});

test("a rejected reservation never sends an email or changes an existing account", async () => {
  const { IssuerService, calls } = setup({ reservationError: new Error("already exists") });
  await assert.rejects(IssuerService.createWithInvitation(input, "issuer-admin", "actor", "url"), /could not be reserved/);
  assert.equal(calls.length, 1);
});

test("mail and profile-link failures are explicit, not success-shaped", async () => {
  const invite = setup({ inviteError: new Error("SMTP failure") });
  await assert.rejects(invite.IssuerService.createWithInvitation(input, "issuer-operator", "actor", "url"),
    /Issuer saved.*could not be sent/);
  assert.equal(invite.calls.length, 2);
  const link = setup({ linkError: new Error("DB failure") });
  await assert.rejects(link.IssuerService.createWithInvitation(input, "issuer-operator", "actor", "url"),
    /Invitation sent.*could not be linked/);
});

test("issuer key provisioning preserves quota errors and never sends invitations after rejection",async()=>{
  for(const message of ["SUBSCRIPTION_LIMIT: issuers","SUBSCRIPTION_INACTIVE: New creation blocked"]) {
    const error={code:"P0001",message};
    const invitation=setup({reservationError:error});
    await assert.rejects(invitation.IssuerService.createWithInvitation(input,"issuer","actor","url"),e=>e===error);
    assert.equal(invitation.calls.length,1);
    const {IssuerService}=load({rpc:async()=>({data:null,error})});
    await assert.rejects(IssuerService.create(input,"actor"),e=>e===error);
  }
});
