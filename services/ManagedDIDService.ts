import { getSupabaseAdmin, getSupabaseServerClient } from "../lib/supabase/server";
import { managedDIDSlug, validateManagedDocument } from "../lib/managed-did";

export class ManagedDIDError extends Error {
  constructor(message="Managed organization identity is unavailable.",public readonly status=503){super(message);}
}
const columns="id,organization_id,did,path_slug,status,method,hosting_mode,did_document,created_at,updated_at";
export const ManagedDIDService = {
  async list(organizationId?:string) {
    const client=await getSupabaseServerClient();
    const records=[];
    for (let from=0;;from+=500) {
      let query=client.from("organization_dids").select(columns).order("id").range(from,from+499);
      if (organizationId) query=query.eq("organization_id",organizationId);
      const {data,error}=await query;
      if (error) throw new ManagedDIDError();
      records.push(...(data??[]).map(row=>({
        id:String(row.id),organizationId:String(row.organization_id),did:String(row.did),
        status:String(row.status),method:String(row.method),hostingMode:String(row.hosting_mode),
        document:validateManagedDocument(row.did_document,row.did),
        createdAt:String(row.created_at),updatedAt:String(row.updated_at),
      })));
      if (!data || data.length<500) return records;
    }
  },
  async publicDocument(slug:string) {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) throw new ManagedDIDError("Managed DID not found.",404);
    const {data,error}=await getSupabaseAdmin().from("organization_dids")
      .select("did,did_document").eq("path_slug",slug).maybeSingle();
    if (error) throw new ManagedDIDError();
    if (!data) throw new ManagedDIDError("Managed DID not found.",404);
    try {return validateManagedDocument(data.did_document,data.did);}
    catch {throw new ManagedDIDError("Managed public document failed validation.");}
  },
  async methods(organizationId:string,issuerId?:string) {
    const client=await getSupabaseServerClient();
    const records=[];
    for(let from=0;;from+=500) {
      let query=client.from("organization_verification_methods")
        .select("id,issuer_id,key_id,verification_method,key_fingerprint,key_version,status,created_at")
        .eq("organization_id",organizationId).order("verification_method").range(from,from+499);
      if (issuerId) query=query.eq("issuer_id",issuerId);
      const {data,error}=await query;
      if (error) throw new ManagedDIDError();
      records.push(...data??[]);
      if (!data || data.length<500)return records;
    }
  },
  async binding(issuerId:string,keyId:string,allowHistorical=false) {
    const {data,error}=await getSupabaseAdmin().from("organization_verification_methods")
      .select("organization_id,organization_did_id,verification_method,status")
      .eq("issuer_id",issuerId).eq("key_id",keyId).maybeSingle();
    if (error) throw new ManagedDIDError();
    if (!data || !allowHistorical && data.status!=="active") throw new ManagedDIDError("Issuer managed verification method is inactive or missing.",409);
    const identity=await getSupabaseAdmin().from("organization_dids").select("did,status")
      .eq("id",data.organization_did_id).single();
    if (identity.error || !identity.data || !allowHistorical && identity.data.status!=="active") {
      throw new ManagedDIDError("Organization managed DID is inactive or missing.",409);
    }
    return {did:String(identity.data.did),verificationMethod:String(data.verification_method)};
  },
  async statusOwner(did:string) {
    if (!managedDIDSlug(did)) throw new ManagedDIDError("Managed DID not found.",404);
    const {data,error}=await getSupabaseAdmin().from("organization_dids").select("organization_id")
      .eq("did",did).maybeSingle();
    if (error) throw new ManagedDIDError();
    if (!data) throw new ManagedDIDError("Managed DID not found.",404);
    return String(data.organization_id);
  },
  async auditDownload(organizationId:string,actorId:string) {
    const {error}=await getSupabaseAdmin().rpc("phase4_audit_download",{p_org:organizationId,p_actor:actorId});
    if (error) throw new ManagedDIDError("DID download could not be audited.");
  },
};
