const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const path = require("node:path");
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = (version = 1) => ({
  publicKey: "-----BEGIN PUBLIC KEY-----\npublic\n-----END PUBLIC KEY-----",
  publicKeyMultibase: "zpublic", fingerprint: `SHA256:key-${version}`, encryptionKeyId: "v1", keyVersion: version,
  encryptedPrivateKey: JSON.stringify({ v: 1, iv: "a".repeat(16), tag: "a".repeat(24), data: "encrypted" }),
});
const migration = name => readFileSync(path.join(__dirname, "..", `${name}.sql`), "utf8");
async function setup(t, customer = false) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
    CREATE DOMAIN citext AS text;CREATE SCHEMA auth;CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`);
  for (const name of ["001_initial_schema", "002_issuer_auth", "003_supabase_auth", "004_supabase_api_only",
    "006_bitstring_status", "007_issuer_rls_policies", "008_multi_issuer_profiles", "009_profile_status_lists",
    "010_issuer_profile_identity_lock", "011_security_boundary_hardening", "012_issuer_user_invitations"]) {
    await db.exec(migration(name).replace(/CREATE EXTENSION IF NOT EXISTS \w+;/g, ""));
  }
  await db.query("INSERT INTO organizations(id,name,slug) VALUES($1,'A','academy-a'),($2,'B','academy-b')", [id(1), id(2)]);
  await db.query("INSERT INTO issuers(id,organization_id,name,slug,contact_email) VALUES($1,$2,'A','a','a@example.com'),($3,$4,'B','b','b@example.com')",
    [id(11), id(1), id(12), id(2)]);
  for (const [n, role] of [[21, "platform-admin"], [22, "issuer-admin"], [23, "issuer-operator"], [24, "verifier"]]) {
    await db.query("INSERT INTO auth.users VALUES($1,$2)", [id(n), `${n}@example.com`]);
    await db.query(`INSERT INTO users(id,auth_user_id,organization_id,issuer_id,email,display_name,roles)
      VALUES($1,$1,$2,$3,$4,'User',ARRAY[$5])`, [id(n), id(1), id(11), `${n}@example.com`, role]);
  }
  await db.query("INSERT INTO templates(id,issuer_id,slug,name) VALUES($1,$2,'legacy','Legacy')", [id(31), id(11)]);
  const bytes = '{ "issuer": "did:web:legacy.example", "proof": { "proofValue": "keep-exact" } }\n';
  await db.query(`INSERT INTO credentials(id,issuer_id,template_id,external_id,recipient_name,recipient_email,credential,issuer_did,verification_method)
    VALUES($1,$2,$3,'legacy','Recipient','r@example.com',$4::jsonb,'did:web:legacy.example','did:web:legacy.example#old')`,
    [id(41), id(11), id(31), JSON.stringify(bytes)]);
  for (const name of ["015_organization_foundation", "016_multi_issuer_foundation", "017_issuer_key_management"]) await db.exec(migration(name));
  await db.query("SELECT phase3_save_key($1,$2::jsonb,$3,NULL,true)", [id(11), JSON.stringify({
    ...key(), controller: "did:web:legacy.example", verificationMethod: "did:web:legacy.example#old",
  }), id(21)]);
  await db.query("SELECT phase3_save_key($1,$2::jsonb,$3,NULL,false)", [id(12), JSON.stringify(key()), id(21)]);
  await db.exec(migration("018_managed_organization_dids"));
  if (customer) await db.exec(migration("019_self_managed_dids"));
  async function as(n, sql, args = []) {
    await db.exec("SET ROLE authenticated");
    try { await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(n)]); return await db.query(sql, args); }
    finally { await db.exec("RESET ROLE"); }
  }
  const create = (n = 50, org = 1) => db.query("SELECT phase3_create_issuer($1::jsonb,$2::jsonb,$3,NULL)", [
    JSON.stringify({ id: id(n), organizationId: id(org), name: `Issuer ${n}`, slug: `issuer-${n}`, contactEmail: `${n}@example.com` }),
    JSON.stringify(key()), id(21),
  ]);
  const document = async (org = 1) => (await db.query("SELECT * FROM organization_dids WHERE organization_id=$1", [id(org)])).rows[0];
  return { db, as, create, document, bytes };
}
module.exports = { setup, id, key };
