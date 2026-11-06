import { getSupabaseAdmin } from "../lib/supabase/server";
import { IssuerKeyError, privateKeyObject, provisionKey, publicMaterial, signingMultikey } from "../lib/issuer-key-crypto";
import { createSafeDocumentLoader } from "../lib/safe-document-loader";
import type { DIDSigningContext } from "../lib/trustvc";
import JSZip from "jszip";
import { ManagedDIDService } from "./ManagedDIDService";

interface StoredKey {
  id: string; issuer_id: string; public_key: string; public_key_multibase: string;
  encrypted_private_key: string; encryption_key_id: string; fingerprint: string;
  algorithm: string; key_version: number; status: string; controller: string | null;
  verification_method: string | null; created_by: string | null; created_at: string;
  rotated_at: string | null; export_expires_at: string | null; export_claimed_at: string | null;
}
const publicColumns = "id,issuer_id,public_key,public_key_multibase,fingerprint,algorithm,key_version,status,created_at,rotated_at,created_by,export_expires_at,export_claimed_at";
const safeLoader = () => createSafeDocumentLoader(async () => { throw new Error("Local identity loading is disabled."); },new Set(),new Set());

async function issuerOwner(issuerId: string) {
  const {data,error} = await getSupabaseAdmin().from("issuers")
    .select("id,organization_id,name,display_name,did_uri,verification_method,organizations(display_name)")
    .eq("id",issuerId).single();
  if (error || !data) throw new IssuerKeyError("Issuer key owner could not be resolved.");
  return data;
}

async function stored(issuerId: string, keyId?: string): Promise<StoredKey> {
  let query = getSupabaseAdmin().from("issuer_keys").select("*").eq("issuer_id",issuerId);
  query = keyId ? query.eq("id",keyId) : query.eq("status","active");
  const {data,error} = await query.single();
  if (error || !data) throw new IssuerKeyError("Issuer has no usable signing key. Complete encrypted-key migration or activate its pending key.");
  return data;
}

async function material(key: StoredKey) {
  const owner = await issuerOwner(key.issuer_id);
  const privateKey = privateKeyObject(key.encrypted_private_key,{
    organizationId:owner.organization_id,issuerId:key.issuer_id,keyVersion:key.key_version,
    encryptionKeyId:key.encryption_key_id,
  });
  const derived = publicMaterial(privateKey);
  if (derived.fingerprint !== key.fingerprint || derived.publicKeyMultibase !== key.public_key_multibase ||
    derived.publicKey !== key.public_key) throw new IssuerKeyError("Stored issuer public key does not match encrypted key.");
  return { owner,privateKey };
}

export async function assertPublishedKey(did: string, method: string, publicMultikey: string, loader = safeLoader()) {
  try {
    if (!did.startsWith("did:web:") || !method.startsWith(`${did}#`)) throw new Error();
    const result = await loader(did);
    const document = result.document as Record<string,unknown>;
    const assertions = Array.isArray(document.assertionMethod) ? document.assertionMethod : [];
    const methods = Array.isArray(document.verificationMethod) ? document.verificationMethod : [];
    const permitted = assertions.some(entry => entry === method ||
      entry && typeof entry === "object" && entry.id === method);
    const entry = [...methods,...assertions].find(value => value && typeof value === "object" &&
      value.id === method);
    if (!permitted || !entry || entry.type !== "Multikey" || entry.controller !== did ||
      entry.publicKeyMultibase !== publicMultikey) throw new Error();
  } catch { throw new IssuerKeyError("The existing published assertion method does not match this issuer key.",409); }
}

export const IssuerKeyService = {
  async list(issuerId: string, actorId: string, canManage: boolean) {
    const {data,error} = await getSupabaseAdmin().from("issuer_keys").select(publicColumns)
      .eq("issuer_id",issuerId).order("key_version",{ascending:false});
    if (error) throw new IssuerKeyError("Issuer key metadata could not be loaded.");
    return (data ?? []).map(row => canManage ? ({
      id:row.id,issuerId:row.issuer_id,fingerprint:row.fingerprint,
      algorithm:row.algorithm,keyVersion:row.key_version,status:row.status,
      createdAt:row.created_at,rotatedAt:row.rotated_at,
      publicKey:row.public_key,
      downloadAvailable:canManage && row.key_version === 1 && row.created_by === actorId &&
        !row.export_claimed_at && row.status !== "retired" && !!row.export_expires_at &&
        Date.parse(row.export_expires_at) > Date.now(),
    }) : ({id:row.id,issuerId:row.issuer_id,fingerprint:row.fingerprint,downloadAvailable:false}));
  },

  async rotate(issuerId: string, actorId: string, ip: string) {
    const owner = await issuerOwner(issuerId);
    const {data,error} = await getSupabaseAdmin().from("issuer_keys").select("key_version,status")
      .eq("issuer_id",issuerId).order("key_version",{ascending:false}).limit(1).maybeSingle();
    if (error) throw new IssuerKeyError();
    if (!data) throw new IssuerKeyError("Migrate the issuer's initial key before rotation.",409);
    if (data.status === "pending") throw new IssuerKeyError("Activate the existing pending key before creating another version.",409);
    const version = data.key_version+1;
    const key = provisionKey(owner.organization_id,issuerId,version);
    const result = await getSupabaseAdmin().rpc("phase3_save_key",{
      p_issuer:issuerId,p_key:{...key,keyVersion:version},p_actor:actorId,p_ip:ip,
    });
    if (result.error) throw new IssuerKeyError("Issuer key version could not be created; refresh its key history.",409);
  },

  async activate(issuerId: string,keyId: string,actorId: string,ip: string) {
    const key = await stored(issuerId,keyId);
    if (key.status !== "pending") throw new IssuerKeyError("Only a pending key can be activated.",409);
    await material(key);
    const {error:activationError} = await getSupabaseAdmin().rpc("phase4_activate_key",{
      p_issuer:issuerId,p_key:keyId,p_actor:actorId,p_ip:ip,
    });
    if (activationError) throw new IssuerKeyError("Managed key activation failed; refresh the issuer and its organization status.",409);
  },

  async signer(issuerId: string): Promise<DIDSigningContext & {keyId:string}> {
    const key = await stored(issuerId);
    const binding=await ManagedDIDService.binding(issuerId,key.id);
    const {privateKey} = await material(key);
    return {...signingMultikey(privateKey,binding.did,binding.verificationMethod),keyId:key.id};
  },

  async signerForStatus(did: string, issuerId?: string): Promise<DIDSigningContext> {
    let query = getSupabaseAdmin().from("issuer_keys").select("id,issuer_id,fingerprint,verification_method,key_version")
      .eq("controller",did).in("status",["active","retired"]).order("key_version",{ascending:false});
    if (issuerId) query = query.eq("issuer_id",issuerId);
    const {data,error} = await query;
    if (error || !data?.length) throw new IssuerKeyError("Status-list issuer signing key is not available.");
    const newestByIssuer=new Map<string,(typeof data)[number]>();
    for (const row of data) if(!newestByIssuer.has(row.issuer_id))newestByIssuer.set(row.issuer_id,row);
    const candidates=[...newestByIssuer.values()];
    if (new Set(candidates.map(row=>`${row.fingerprint}|${row.verification_method}`)).size !== 1) {
      throw new IssuerKeyError("Ambiguous status-list issuer signing identity.");
    }
    const legacy=candidates[0];
    const key=await stored(legacy.issuer_id,legacy.id);
    if (!["active","retired"].includes(key.status) || key.controller!==did || !key.verification_method) {
      throw new IssuerKeyError("Historical status-list signer is unavailable.");
    }
    const {privateKey}=await material(key);
    return signingMultikey(privateKey,did,key.verification_method);
  },

  async signerForManagedStatus(did:string):Promise<DIDSigningContext> {
    const org=await ManagedDIDService.statusOwner(did);
    const {data,error}=await getSupabaseAdmin().from("organization_verification_methods")
      .select("issuer_id,key_id,verification_method").eq("organization_id",org)
      .order("created_at",{ascending:false}).order("id").limit(1).maybeSingle();
    if (error || !data) throw new IssuerKeyError("Managed status-list signer is unavailable.");
    const key=await stored(data.issuer_id,data.key_id);
    if (!["active","retired"].includes(key.status)) throw new IssuerKeyError("Managed status-list key is unusable.");
    const binding=await ManagedDIDService.binding(data.issuer_id,data.key_id,true);
    if (binding.did!==did) throw new IssuerKeyError("Managed status-list ownership mismatch.");
    const {privateKey}=await material(key);
    return signingMultikey(privateKey,did,binding.verificationMethod);
  },

  async download(issuerId: string,actorId: string,ip: string) {
    const {data,error} = await getSupabaseAdmin().from("issuer_keys").select("id")
      .eq("issuer_id",issuerId).eq("key_version",1).eq("created_by",actorId)
      .is("export_claimed_at",null).gt("export_expires_at",new Date().toISOString()).neq("status","retired").maybeSingle();
    if (error) throw new IssuerKeyError();
    if (!data) throw new IssuerKeyError("Initial key download is unavailable or has expired.",409);
    const key = await stored(issuerId,data.id);
    const {owner,privateKey} = await material(key);
    const privatePem = Buffer.from(privateKey.export({format:"pem",type:"pkcs8"}));
    try {
      const zip = new JSZip();
      zip.file("issuer-public.pem",key.public_key);
      zip.file("issuer-private.pem",privatePem);
      zip.file("metadata.json",JSON.stringify({
        organization:owner.organizations,issuer:{id:owner.id,name:owner.display_name},
        fingerprint:key.fingerprint,created_at:key.created_at,algorithm:key.algorithm,key_version:key.key_version,
      },null,2));
      const bytes = await zip.generateAsync({type:"nodebuffer",compression:"STORE"});
      const {data:claimed,error:claimError} = await getSupabaseAdmin().rpc("phase3_claim_export",{
        p_issuer:issuerId,p_actor:actorId,p_ip:ip,
      });
      if (claimError || claimed !== key.id) {
        bytes.fill(0);
        throw new IssuerKeyError("Initial key download was already claimed or has expired.",409);
      }
      return bytes;
    } finally { privatePem.fill(0); }
  },
};
