import { getSupabaseAdmin, getSupabaseServerClient } from "../lib/supabase/server";
import { parseStoredCredential } from "../lib/stored-credential";

export interface CredentialInput {
  issuerId: string;
  signingKeyId?: string;
  templateId: string;
  issuerProfileId?: string;
  issuerDid?: string;
  documentStoreAddress?: string | null;
  documentStoreNetwork?: string | null;
  verificationMethod?: string;
  externalId: string;
  recipientName: string;
  recipientEmail: string;
  credential: Record<string, unknown>;
  documentHash?: string;
  issuingMethods?: string[];
  validFrom?: string;
  validUntil?: string;
}

export interface CredentialRecord {
  id: string;
  organizationId: string;
  issuerId: string;
  templateId: string | null;
  issuerName: string | null;
  didUsed: string | null;
  keyFingerprint: string | null;
  keyVersion: number | null;
  signingKeyId: string | null;
  issuerProfileId: string | null;
  issuerDid: string | null;
  documentStoreAddress: string | null;
  documentStoreNetwork: string | null;
  verificationMethod: string | null;
  externalId: string;
  recipientName: string;
  recipientEmail: string;
  credential: Record<string, unknown>;
  documentHash: string | null;
  issuingMethods: string[];
  status: "issued" | "revoked" | "suspended" | "expired";
  issuedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  issuerSnapshot: Record<string, unknown>;
}

export class DuplicateCredentialError extends Error {}

const mapRow = (row: Record<string, unknown>): CredentialRecord => ({
  id: String(row.id),
  organizationId: String(row.organization_id),
  issuerId: String(row.issuer_id),
  issuerName: typeof row.issuer_name === "string" ? row.issuer_name : null,
  didUsed: typeof row.did_used === "string" ? row.did_used : null,
  keyFingerprint: typeof row.key_fingerprint === "string" ? row.key_fingerprint : null,
  keyVersion: typeof row.key_version === "number" ? row.key_version : null,
  signingKeyId: typeof row.signing_key_id === "string" ? row.signing_key_id : null,
  templateId: row.template_id ? String(row.template_id) : null,
  issuerProfileId: row.issuer_profile_id ? String(row.issuer_profile_id) : null,
  issuerDid: row.issuer_did ? String(row.issuer_did) : null,
  documentStoreAddress: row.document_store_address ? String(row.document_store_address) : null,
  documentStoreNetwork: row.document_store_network ? String(row.document_store_network) : null,
  verificationMethod: row.verification_method ? String(row.verification_method) : null,
  externalId: String(row.external_id),
  recipientName: String(row.recipient_name),
  recipientEmail: String(row.recipient_email),
  credential: parseStoredCredential(row.credential),
  documentHash: row.document_hash ? String(row.document_hash) : null,
  issuingMethods: (row.issuing_methods as string[]) ?? [],
  status: row.status as CredentialRecord["status"],
  issuedAt: row.issued_at ? String(row.issued_at) : new Date().toISOString(),
  validFrom: row.valid_from ? String(row.valid_from) : null,
  validUntil: row.valid_until ? String(row.valid_until) : null,
  issuerSnapshot: row.issuer_snapshot && typeof row.issuer_snapshot === "object"
    ? row.issuer_snapshot as Record<string, unknown> : {},
});

export const CredentialService = {
  async list(issuerId: string, options: { limit?: number; status?: string; platformAdmin?: boolean; organizationId?: string } = {}) {
    const supabase = options.platformAdmin ? getSupabaseAdmin() : await getSupabaseServerClient();
    const limit = options.platformAdmin && options.limit === undefined
      ? undefined
      : Math.min(Math.max(options.limit ?? 100, 1), 500);
    const credentials: CredentialRecord[] = [];
    const pageSize = limit ?? 500;

    for (let offset = 0; ; offset += pageSize) {
      let query = supabase
        .from("credentials")
        .select("*")
        .order("issued_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (!options.platformAdmin) query = options.organizationId
        ? query.eq("organization_id", options.organizationId) : query.eq("issuer_id", issuerId);
      if (options.status) query = query.eq("status", options.status);

      const { data, error } = await query;
      if (error) throw error;
      credentials.push(...(data ?? []).map(mapRow));
      if (limit !== undefined || !data || data.length < pageSize) return credentials;
    }
  },

  async get(id: string, issuerId?: string) {
    const supabase = await getSupabaseServerClient();
    let query = supabase
      .from("credentials")
      .select("*")
      .eq("id", id);
    if (issuerId) query = query.eq("issuer_id", issuerId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  },

  async findByExternalId(externalId: string) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("credentials")
      .select("*")
      .eq("external_id", externalId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  },

  /**
   * Public QR/ID verification: anonymous visitors cannot read credentials
   * through row level security, so this uses the service role. Callers must
   * only return verification state, never the stored recipient details.
   */
  async findForPublicVerification(externalId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("credentials")
      .select("*")
      .eq("external_id", externalId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  },

  async create(input: CredentialInput) {
    const supabase = await getSupabaseServerClient();
    const payload = {
      issuer_id: input.issuerId,
      ...(input.signingKeyId ? {signing_key_id:input.signingKeyId} : {}),
      template_id: input.templateId ?? null,
      issuer_profile_id: input.issuerProfileId ?? null,
      issuer_did: input.issuerDid ?? null,
      document_store_address: input.documentStoreAddress ?? null,
      document_store_network: input.documentStoreNetwork ?? null,
      verification_method: input.verificationMethod ?? null,
      external_id: input.externalId,
      recipient_name: input.recipientName,
      recipient_email: input.recipientEmail,
      credential: JSON.stringify(input.credential),
      document_hash: input.documentHash ?? null,
      issuing_methods: input.issuingMethods ?? [],
      valid_from: input.validFrom ?? null,
      valid_until: input.validUntil ?? null,
    };

    const { data, error } = await supabase
      .from("credentials")
      .insert(payload)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new DuplicateCredentialError("A credential with this identifier has already been issued.");
      throw error;
    }
    return mapRow(data);
  },

  async attachDocumentHash(externalId: string, issuerId: string, documentHash: string) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("credentials")
      .update({ document_hash: documentHash })
      .eq("external_id", externalId)
      .eq("issuer_id", issuerId)
      .select()
      .single();
    if (error) throw error;
    return data ? mapRow(data) : null;
  },

  async expireOverdue(issuerId?: string) {
    const supabase = await getSupabaseServerClient();
    let q = supabase
      .from("credentials")
      .update({ status: "expired" })
      .eq("status", "issued")
      .lt("valid_until", new Date().toISOString())
      .not("valid_until", "is", null);

    if (issuerId) {
      q = q.eq("issuer_id", issuerId);
    }

    const { data, error } = await q.select("id");
    if (error) throw error;
    return data?.length ?? 0;
  },
};
