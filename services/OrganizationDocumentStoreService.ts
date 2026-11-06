import { getAddress, ZeroAddress } from "ethers";
import { getSupabaseAdmin, getSupabaseServerClient } from "../lib/supabase/server";
import { getDefaultDocumentStoreConfig, testDocumentStoreConnection } from "../lib/document-store";
import type { DocumentStoreConfig } from "../lib/document-store";

export class OrganizationDocumentStoreError extends Error {
  constructor(message="Organization Document Store is unavailable.",public readonly status=503){super(message);}
}
const columns="id,organization_id,network,contract_address,status,approved_by,approved_at,connection_status,checked_at,validation_message,signer_address,created_at";
export const OrganizationDocumentStoreService={
  async list(organizationId:string) {
    const records=[];
    for(let offset=0;;offset+=200) {
      const {data,error}=await (await getSupabaseServerClient()).from("organization_document_stores")
        .select(columns).eq("organization_id",organizationId).order("created_at").order("id").range(offset,offset+199);
      if(error)throw new OrganizationDocumentStoreError();
      records.push(...data??[]);
      if(!data || data.length<200)return records;
    }
  },
  async active(organizationId:string):Promise<(DocumentStoreConfig & {id:string})|null> {
    const {data,error}=await getSupabaseAdmin().from("organization_document_stores")
      .select("id,contract_address,network,approved_by,connection_status").eq("organization_id",organizationId).eq("status","active").maybeSingle();
    if(error)throw new OrganizationDocumentStoreError();
    if(!data)return null;
    if(!data.approved_by || data.connection_status!=="ok")throw new OrganizationDocumentStoreError("Active Document Store failed its connection test. Retest it before issuance; no fallback is used.",409);
    return{id:String(data.id),address:String(data.contract_address),network:String(data.network)};
  },
  async action(organizationId:string,actorId:string,action:string,storeId:string|null,payload:Record<string,unknown>={}) {
    const {error}=await getSupabaseAdmin().rpc("organization_store_action",{
      p_org:organizationId,p_actor:actorId,p_action:action,p_store:storeId,p_payload:payload,
    });
    if(error)throw new OrganizationDocumentStoreError("Document Store action failed. Check ownership approval, active organization, contract assignment and connection test.",409);
  },
  async add(organizationId:string,actorId:string,network:string,address:string) {
    let canonical:string;
    try {canonical=getAddress(address).toLowerCase();}
    catch {throw new OrganizationDocumentStoreError("Enter a valid Ethereum contract address.",400);}
    if(network!=="sepolia" || canonical===ZeroAddress)throw new OrganizationDocumentStoreError("Use a nonzero Sepolia Document Store address.",400);
    const legacy=getDefaultDocumentStoreConfig();
    if(legacy.network===network && legacy.address.toLowerCase()===canonical)throw new OrganizationDocumentStoreError("The platform legacy store cannot be claimed by an organization.",409);
    await this.action(organizationId,actorId,"add",null,{network,address:canonical});
  },
  async test(organizationId:string,actorId:string,storeId:string) {
    const store=(await this.list(organizationId)).find(row=>row.id===storeId);
    if(!store)throw new OrganizationDocumentStoreError("Organization Document Store not found.",404);
    let result:{signerAddress:string}|null=null;
    try {result=await testDocumentStoreConnection({address:store.contract_address,network:store.network});}
    catch {result=null;}
    await this.action(organizationId,actorId,"test",storeId,{ok:!!result,signer:result?.signerAddress??null});
    if(!result)throw new OrganizationDocumentStoreError("Connection test failed. Check Sepolia RPC, deployed contract and server wallet ISSUER_ROLE/REVOKER_ROLE permissions.",422);
  },
  async activate(organizationId:string,actorId:string,storeId:string) {
    await this.test(organizationId,actorId,storeId);
    await this.action(organizationId,actorId,"activate",storeId);
  },
};
