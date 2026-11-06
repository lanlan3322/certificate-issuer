import { getSupabaseAdmin } from "../lib/supabase/server";
import { importMultikey, IssuerKeyError, privateKeyObject, provisionKey, publicMaterial } from "../lib/issuer-key-crypto";

type MigrationIssuer = {id:string;organization_id:string;did_uri:string|null};
type MigrationProfile = {id:string;owner_issuer_id:string;did:string;verification_method:string;key_reference:string};
type MigrationCredential = {id:string;issuer_id:string;issuer_did:string|null;verification_method:string|null};
type MigrationKey = {id:string;issuer_id:string;key_version:number;fingerprint:string;
  encrypted_private_key:string;encryption_key_id:string;controller:string|null;verification_method:string|null};
type ImportEntry = {issuerId:string;legacy:boolean;key:ReturnType<typeof provisionKey> & {
  keyVersion:number;controller?:string;verificationMethod?:string}};

async function allRows<T>(table: string,columns: string) {
  const rows: T[] = [];
  for (let from=0;;from+=500) {
    const {data,error} = await getSupabaseAdmin().from(table).select(columns).order("id").range(from,from+499).returns<T[]>();
    if (error) throw new IssuerKeyError("Issuer-key migration inventory could not be loaded.");
    rows.push(...(data ?? []));
    if (!data || data.length<500) return rows;
  }
}

export const IssuerKeyMigrationService = {
  async plan() {
    let allowed: unknown;
    try {allowed=JSON.parse(process.env.ISSUER_LEGACY_PROFILE_KEY_REFERENCES || "[]");}
    catch {throw new IssuerKeyError("Legacy profile reference allowlist must be a JSON string array.");}
    if (!Array.isArray(allowed) || allowed.some(v=>typeof v!=="string" || !/^[A-Z][A-Z0-9_]{2,127}$/.test(v))) {
      throw new IssuerKeyError("Legacy profile reference allowlist is invalid.");
    }
    const [issuers,profiles,keys,credentials] = await Promise.all([
      allRows<MigrationIssuer>("issuers","id,organization_id,did_uri"),
      allRows<MigrationProfile>("issuer_profiles","id,owner_issuer_id,did,verification_method,key_reference"),
      allRows<Pick<MigrationKey,"id"|"issuer_id"|"controller"|"verification_method"|"fingerprint">>(
        "issuer_keys","id,issuer_id,controller,verification_method,fingerprint"),
      allRows<MigrationCredential>("credentials","id,issuer_id,issuer_did,verification_method"),
    ]);
    const existing = new Set(keys.map(key=>key.issuer_id));
    const controllers=new Map<string,string>();
    const registerBinding=(did: string,method: string,fingerprint: string) => {
      const identity=`${method}|${fingerprint}`;
      if (controllers.has(did) && controllers.get(did)!==identity) {
        throw new IssuerKeyError("Migration blocked: a shared legacy controller has conflicting signing keys.");
      }
      controllers.set(did,identity);
    };
    for (const key of keys) {
      if (key.controller && key.verification_method) registerBinding(key.controller,key.verification_method,key.fingerprint);
    }
    const entries: ImportEntry[] = [];
    for (const issuer of issuers) {
      if (existing.has(issuer.id)) continue;
      const owned=profiles.filter(profile=>profile.owner_issuer_id===issuer.id);
      const bindings=new Map(owned.map(profile=>[`${profile.did}|${profile.verification_method}|${profile.key_reference}`,profile]));
      if (bindings.size>1) throw new IssuerKeyError("Migration blocked: an issuer has multiple existing signing identities. Split its ownership explicitly before importing.");
      const profile=[...bindings.values()][0];
      if (profile && !allowed.includes(profile.key_reference)) {
        throw new IssuerKeyError("Migration blocked: approve existing profile key references in the operator-only allowlist.");
      }
      const did=profile?.did ?? process.env.DID_CONTROLLER ?? process.env.NEXT_PUBLIC_DID_CONTROLLER;
      const method=profile?.verification_method ?? process.env.DID_KEY_ID ?? process.env.NEXT_PUBLIC_DID_KEY_ID;
      const secret=profile ? process.env[profile.key_reference] : process.env.DID_PRIVATE_KEY_MULTIBASE;
      const publicKey=profile ? process.env[`${profile.key_reference}_PUBLIC_KEY_MULTIBASE`]
        : process.env.DID_PUBLIC_KEY_MULTIBASE ?? process.env.NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE;
      if (!did && !method && !secret && !publicKey && !profile && !issuer.did_uri &&
        !credentials.some(credential=>credential.issuer_id===issuer.id)) {
        entries.push({issuerId:issuer.id,legacy:false,key:{
          ...provisionKey(issuer.organization_id,issuer.id,1),keyVersion:1,
        }});
        continue;
      }
      if (!did || !method || !secret || !publicKey || !did.startsWith("did:web:") || !method.startsWith(`${did}#`)) {
        throw new IssuerKeyError("Migration blocked: a complete existing P-256 signer is required. No historical identity will be replaced with a generated key.");
      }
      if (credentials.some(c=>c.issuer_id===issuer.id &&
        (c.issuer_did && c.issuer_did!==did || c.verification_method && c.verification_method!==method))) {
        throw new IssuerKeyError("Migration blocked: historical credential signing identities require explicit reconciliation.");
      }
      const imported=importMultikey(secret,publicKey);
      const material=provisionKey(issuer.organization_id,issuer.id,1,imported);
      registerBinding(did,method,material.fingerprint);
      entries.push({issuerId:issuer.id,legacy:true,key:{
        ...material,keyVersion:1,
        controller:did,verificationMethod:method,
      }});
    }
    return entries;
  },

  async apply(actorId: string,entries: ImportEntry[]) {
    const {error}=await getSupabaseAdmin().rpc("phase3_import_keys",{p_entries:entries,p_actor:actorId});
    if (error) throw new IssuerKeyError("Issuer-key import failed transactionally. No partial import was committed.");
  },

  async rewrap(actorId: string,apply: boolean) {
    const [keys,issuers]=await Promise.all([
      allRows<MigrationKey>("issuer_keys","id,issuer_id,key_version,fingerprint,encrypted_private_key,encryption_key_id"),
      allRows<MigrationIssuer>("issuers","id,organization_id"),
    ]);
    const entries=[];
    for (const key of keys) {
      const organizationId=issuers.find(issuer=>issuer.id===key.issuer_id)?.organization_id;
      if (!organizationId) throw new IssuerKeyError("Encryption rewrap owner is missing.");
      const oldScope={organizationId,issuerId:key.issuer_id,keyVersion:key.key_version,encryptionKeyId:key.encryption_key_id};
      const privateKey=privateKeyObject(key.encrypted_private_key,oldScope);
      if (publicMaterial(privateKey).fingerprint!==key.fingerprint) throw new IssuerKeyError("Encryption rewrap fingerprint mismatch.");
      const rewrapped=provisionKey(organizationId,key.issuer_id,key.key_version,privateKey);
      if (rewrapped.encryptionKeyId===key.encryption_key_id) continue;
      entries.push({id:key.id,previousEnvelope:key.encrypted_private_key,previousKeyId:key.encryption_key_id,
        envelope:rewrapped.encryptedPrivateKey,encryptionKeyId:rewrapped.encryptionKeyId});
    }
    if (apply && entries.length) {
      const {error}=await getSupabaseAdmin().rpc("phase3_rewrap_keys",{p_entries:entries,p_actor:actorId});
      if (error) throw new IssuerKeyError("Encryption rewrap failed transactionally. Keep all old master keys.");
    }
    return entries.length;
  },
};
