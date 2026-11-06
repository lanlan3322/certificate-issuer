import { getSupabaseAdmin, getSupabaseServerClient } from "../lib/supabase/server";
import { managedDIDSlug, managedStatusURL, validateManagedDocument } from "../lib/managed-did";
import { assertCustomerDeployment, customerDomain } from "../lib/self-managed-did";

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
    if (!allowHistorical) {
      const customer=await getSupabaseAdmin().from("self_managed_dids")
        .select("domain,did,selected,revision,validated_revision,validation_status,expected_document,linkage_document,linkage_expires_at")
        .eq("organization_id",data.organization_id).maybeSingle();
      if(customer.error) throw new ManagedDIDError();
      if(customer.data?.selected) {
        const config=customer.data;
        if(config.validation_status!=="valid" || config.revision!==config.validated_revision ||
          !config.linkage_expires_at || Date.parse(config.linkage_expires_at)<=Date.now()) {
          throw new ManagedDIDError("Self-managed DID deployment needs validation. No managed signing fallback is used.",409);
        }
        try {await assertCustomerDeployment(config);}
        catch {throw new ManagedDIDError("Self-managed DID deployment is unavailable, expired or out of date. Republish and validate both files.",409);}
        return {did:String(config.did),verificationMethod:`${config.did}${String(data.verification_method).slice(String(identity.data.did).length)}`};
      }
    }
    return {did:String(identity.data.did),verificationMethod:String(data.verification_method)};
  },
  async statusOwner(did:string) {
    const managed=!!managedDIDSlug(did);
    if (!managed) {
      try {if(`did:web:${customerDomain(did.slice(8))}`!==did)throw new Error();}
      catch {throw new ManagedDIDError("Organization DID not found.",404);}
    }
    const {data,error}=await getSupabaseAdmin().from(managed?"organization_dids":"self_managed_dids").select("organization_id")
      .eq("did",did).maybeSingle();
    if (error) throw new ManagedDIDError();
    if (!data) throw new ManagedDIDError("Managed DID not found.",404);
    return String(data.organization_id);
  },
  async statusURL(did:string,page:number,purpose:string) {
    if(managedDIDSlug(did))return managedStatusURL(did,page,purpose);
    const org=await this.statusOwner(did);
    const {data,error}=await getSupabaseAdmin().from("organization_dids").select("did").eq("organization_id",org).single();
    if(error || !data)throw new ManagedDIDError();
    return managedStatusURL(data.did,page,purpose).replace("/status-list/","/self-managed/status-list/");
  },
  async customerStatusDID(slug:string) {
    const {data,error}=await getSupabaseAdmin().from("organization_dids").select("organization_id").eq("path_slug",slug).maybeSingle();
    if(error || !data)throw new ManagedDIDError("Organization DID not found.",404);
    const customer=await getSupabaseAdmin().from("self_managed_dids").select("did").eq("organization_id",data.organization_id).maybeSingle();
    if(customer.error || !customer.data)throw new ManagedDIDError("Customer DID not found.",404);
    return String(customer.data.did);
  },
  async auditDownload(organizationId:string,actorId:string) {
    const {error}=await getSupabaseAdmin().rpc("phase4_audit_download",{p_org:organizationId,p_actor:actorId});
    if (error) throw new ManagedDIDError("DID download could not be audited.");
  },
};
