import { getSupabaseAdmin } from "../lib/supabase/server";

export interface IssuerProfileInput {
  ownerIssuerId: string;
  issuerName: string;
  displayName: string;
  did: string;
  verificationMethod: string;
  documentStoreAddress?: string | null;
  documentStoreNetwork?: string | null;
  logoUrl?: string | null;
  website?: string | null;
  active?: boolean;
  keyReference: string;
}

export interface IssuerProfileRecord extends IssuerProfileInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export class IssuerProfileIdentityLockedError extends Error {
  constructor() {
    super("Issuer profile DID and signing key cannot change after first use.");
    this.name = "IssuerProfileIdentityLockedError";
  }
}

const mapRow = (row: Record<string, unknown>): IssuerProfileRecord => ({
  id: String(row.id),
  ownerIssuerId: String(row.owner_issuer_id),
  issuerName: String(row.issuer_name),
  displayName: String(row.display_name),
  did: String(row.did),
  verificationMethod: String(row.verification_method),
  documentStoreAddress: row.document_store_address ? String(row.document_store_address) : null,
  documentStoreNetwork: row.document_store_network ? String(row.document_store_network) : null,
  logoUrl: row.logo_url ? String(row.logo_url) : null,
  website: row.website ? String(row.website) : null,
  active: row.active !== false,
  keyReference: String(row.key_reference),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

function toDatabase(input: Omit<IssuerProfileInput, "ownerIssuerId">) {
  return {
    issuer_name: input.issuerName,
    display_name: input.displayName,
    did: input.did,
    verification_method: input.verificationMethod,
    document_store_address: input.documentStoreAddress ?? null,
    document_store_network: input.documentStoreNetwork ?? null,
    logo_url: input.logoUrl ?? null,
    website: input.website ?? null,
    active: input.active ?? true,
    key_reference: input.keyReference,
  };
}

export const IssuerProfileService = {
  async list(ownerIssuerId: string, options: { includeInactive?: boolean } = {}) {
    let query = getSupabaseAdmin()
      .from("issuer_profiles")
      .select("*")
      .eq("owner_issuer_id", ownerIssuerId)
      .order("created_at", { ascending: false });

    if (!options.includeInactive) query = query.eq("active", true);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async get(id: string, ownerIssuerId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("issuer_profiles")
      .select("*")
      .eq("id", id)
      .eq("owner_issuer_id", ownerIssuerId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  },

  async getForPublicDID(did: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("issuer_profiles")
      .select("id, did, verification_method, key_reference")
      .eq("did", did)
      .maybeSingle();
    if (error) throw error;
    return data ? {
      id: String(data.id),
      did: String(data.did),
      verificationMethod: String(data.verification_method),
      keyReference: String(data.key_reference),
    } : null;
  },

  async create(input: IssuerProfileInput) {
    const { data, error } = await getSupabaseAdmin()
      .from("issuer_profiles")
      .insert({
        owner_issuer_id: input.ownerIssuerId,
        ...toDatabase(input),
      })
      .select()
      .single();
    if (error) throw error;
    return mapRow(data);
  },

  async update(
    id: string,
    ownerIssuerId: string,
    input: Partial<Omit<IssuerProfileInput, "ownerIssuerId">>
  ) {
    const updates: Record<string, unknown> = {};
    const fields: Array<[keyof typeof input, string]> = [
      ["issuerName", "issuer_name"],
      ["displayName", "display_name"],
      ["did", "did"],
      ["verificationMethod", "verification_method"],
      ["documentStoreAddress", "document_store_address"],
      ["documentStoreNetwork", "document_store_network"],
      ["logoUrl", "logo_url"],
      ["website", "website"],
      ["active", "active"],
      ["keyReference", "key_reference"],
    ];
    for (const [source, target] of fields) {
      if (input[source] !== undefined) updates[target] = input[source];
    }

    const { data, error } = await getSupabaseAdmin()
      .from("issuer_profiles")
      .update(updates)
      .eq("id", id)
      .eq("owner_issuer_id", ownerIssuerId)
      .select()
      .maybeSingle();
    if (error?.code === "55000" &&
        error.message === "Issuer profile identity is immutable after first use.") {
      throw new IssuerProfileIdentityLockedError();
    }
    if (error) throw error;
    if (!data) throw new Error("Issuer profile not found.");
    return mapRow(data);
  },
};
