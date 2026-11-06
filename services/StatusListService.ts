import { getSupabaseAdmin } from "../lib/supabase/server";
import { createBitstringEntries, createStatusListDocument,
  statusListURL, type StatusSnapshotEntry, type StatusPurpose } from "../lib/bitstring-status";
import { resolveDIDController } from "../lib/did-utils";
import { signDocumentWithDID } from "../lib/trustvc";
import { IssuerKeyService } from "./IssuerKeyService";
import { isRootDidWeb } from "../lib/did-publication";
import { IssuerProfileService } from "./IssuerProfileService";
import { DuplicateCredentialError } from "./CredentialService";
import { managedDIDSlug,managedStatusURL } from "../lib/managed-did-urls";
import { ManagedDIDService } from "./ManagedDIDService";

interface StatusIssuerProfile {
  id: string;
  did: string;
  verificationMethod: string;
  keyReference: string;
}

function statusListBaseForDID(did: string) {
  if (!isRootDidWeb(did)) {
    throw new Error("Status list issuer must use a root did:web hostname.");
  }
  return `https://${did.slice("did:web:".length)}`;
}

export function requireStatusListConfiguration(profile?: StatusIssuerProfile) {
  if (process.env.ENABLE_BITSTRING_STATUS_LIST !== "true") {
    throw new Error("The opt-in Bitstring Status List profile is not enabled.");
  }
  const base = profile
    ? statusListBaseForDID(profile.did)
    : process.env.STATUS_LIST_BASE_URL;
  if (!base) throw new Error("STATUS_LIST_BASE_URL is required.");
  const origin = new URL(base);
  statusListURL(base, 0, "revocation");
  if (origin.port || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("STATUS_LIST_BASE_URL must be an HTTPS origin without a path or port.");
  }
  const did = profile?.did ?? resolveDIDController();
  const expected = `did:web:${origin.hostname}`;
  if (did !== expected) throw new Error("Status list origin must match the issuer did:web domain.");
  return base;
}

export const StatusListService = {
  async reserveManaged(issuerId:string,externalId:string,did:string) {
    if (process.env.ENABLE_BITSTRING_STATUS_LIST!=="true" || !managedDIDSlug(did)) {
      throw new Error("Managed Bitstring Status List issuance is not configured.");
    }
    const org=await ManagedDIDService.statusOwner(did);
    const {data,error}=await getSupabaseAdmin().rpc("phase4_reserve_status",{
      p_org:org,p_issuer:issuerId,p_external:externalId,
    });
    if (error?.code==="23505") throw new DuplicateCredentialError("Credential identifier already has a reserved status index.");
    if (error || (typeof data!=="number" && (typeof data!=="string" || !/^(0|[1-9][0-9]*)$/.test(data))) ||
      !Number.isSafeInteger(Number(data)) || Number(data)<0) throw new Error("Managed status allocation failed.");
    const allocation=Number(data);
    return (["revocation","suspension"] as const).map(purpose=>{
      const url=managedStatusURL(did,Math.floor(allocation/131072),purpose);
      return{id:`${url}#${allocation%131072}`,type:"BitstringStatusListEntry",statusPurpose:purpose,
        statusListIndex:String(allocation%131072),statusListCredential:url};
    });
  },
  async publishManaged(page:number,purpose:StatusPurpose,did:string) {
    if (process.env.ENABLE_BITSTRING_STATUS_LIST!=="true") throw new Error("Status list publication is not enabled.");
    const org=await ManagedDIDService.statusOwner(did);
    const url=managedStatusURL(did,page,purpose);
    const {data,error}=await getSupabaseAdmin().rpc("phase4_read_status",{p_org:org,p_page:page});
    if (error) throw new Error("Managed status snapshot is unavailable.");
    if (data===null) return null;
    if (!Array.isArray(data)) throw new Error("Managed status snapshot is invalid.");
    const entries:StatusSnapshotEntry[]=data.map((entry:unknown)=>{
      if (!entry || typeof entry!=="object" || !("index" in entry) || !("status" in entry) ||
        typeof entry.index!=="number" || !["issued","revoked","suspended","expired"].includes(String(entry.status))) {
        throw new Error("Managed status snapshot is invalid.");
      }
      return{index:entry.index,status:entry.status as StatusSnapshotEntry["status"]};
    });
    const document=await createStatusListDocument(url,did,purpose,entries);
    const context=await IssuerKeyService.signerForManagedStatus(did);
    const signed=await signDocumentWithDID(document,undefined,context);
    if (!signed.signed) throw new Error("Managed status-list signing failed.");
    return signed.credential;
  },
  async reserve(issuerId: string, externalId: string, profile?: StatusIssuerProfile) {
    const base = requireStatusListConfiguration(profile);
    const { data, error } = profile
      ? await getSupabaseAdmin().rpc("reserve_profile_bitstring_status", {
          p_issuer: issuerId, p_profile: profile.id, p_external: externalId,
        })
      : await getSupabaseAdmin().rpc("reserve_bitstring_status", {
          p_issuer: issuerId, p_external: externalId,
        });
    if (error?.code === "23505") {
      throw new DuplicateCredentialError("Credential identifier already has a reserved status index. Use a new identifier.");
    }
    if (error) throw error;
    const allocation = Number(data);
    if ((typeof data !== "number" && (typeof data !== "string" || !/^(0|[1-9][0-9]*)$/.test(data))) ||
        !Number.isSafeInteger(allocation) || allocation < 0) {
      throw new Error("Status allocation did not return a safe index.");
    }
    return createBitstringEntries(base, allocation);
  },
  async publish(page: number, purpose: StatusPurpose, issuerDid?: string) {
    const isLegacy = !issuerDid || issuerDid === resolveDIDController();
    const profile = !isLegacy ? await IssuerProfileService.getForPublicDID(issuerDid!) : null;
    if (!isLegacy && !profile) {
      throw new Error("Issuer profile for status list DID was not found.");
    }
    const base = requireStatusListConfiguration(profile ?? undefined);
    const url = statusListURL(base, page, purpose);
    const { data, error } = profile
      ? await getSupabaseAdmin().rpc("read_profile_bitstring_status", {
          p_page: page, p_profile: profile.id,
        })
      : await getSupabaseAdmin().rpc("read_bitstring_status", { p_page: page });
    if (error) throw error;
    if (data === null) return null;
    if (!Array.isArray(data)) throw new Error("Invalid status snapshot response.");
    const entries: StatusSnapshotEntry[] = data.map((entry: unknown) => {
      if (!entry || typeof entry !== "object" || !("index" in entry) || !("status" in entry) ||
          typeof entry.index !== "number" ||
          !["issued", "revoked", "suspended", "expired"].includes(String(entry.status))) {
        throw new Error("Invalid status snapshot entry.");
      }
      return { index: entry.index, status: entry.status as StatusSnapshotEntry["status"] };
    });
    const issuer = profile?.did ?? resolveDIDController();
    const document = await createStatusListDocument(url, issuer, purpose, entries);
    const signer = await IssuerKeyService.signerForStatus(issuer,profile?.ownerIssuerId);
    const signed = await signDocumentWithDID(document, undefined, signer);
    if (!signed.signed) throw new Error(signed.error ?? "Status list signing failed.");
    return signed.credential;
  },
};
