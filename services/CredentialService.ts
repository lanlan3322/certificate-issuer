import { getSupabaseServerClient } from "../lib/supabase/server";

export interface CredentialInput {
  issuerId: string;
  templateId?: string;
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
  issuerId: string;
  templateId: string | null;
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
}

export class DuplicateCredentialError extends Error {}

const mapRow = (row: Record<string, unknown>): CredentialRecord => ({
  id: String(row.id),
  issuerId: String(row.issuer_id),
  templateId: row.template_id ? String(row.template_id) : null,
  externalId: String(row.external_id),
  recipientName: String(row.recipient_name),
  recipientEmail: String(row.recipient_email),
  credential: (row.credential as Record<string, unknown>) ?? {},
  documentHash: row.document_hash ? String(row.document_hash) : null,
  issuingMethods: (row.issuing_methods as string[]) ?? [],
  status: row.status as CredentialRecord["status"],
  issuedAt: String(row.issued_at),
  validFrom: row.valid_from ? String(row.valid_from) : null,
  validUntil: row.valid_until ? String(row.valid_until) : null,
});

export const CredentialService = {
  async list(issuerId: string, options: { limit?: number; status?: string } = {}) {
    const supabase = await getSupabaseServerClient();
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

    let queryBuilder = supabase
      .from("credentials")
      .select("*")
      .eq("issuer_id", issuerId)
      .order("issued_at", { ascending: false })
      .limit(limit);

    if (options.status) {
      queryBuilder = queryBuilder.eq("status", options.status);
    }

    const { data, error } = await queryBuilder;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async get(id: string, issuerId: string) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("credentials")
      .select("*")
      .eq("id", id)
      .eq("issuer_id", issuerId)
      .maybeSingle();
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

  async create(input: CredentialInput) {
    const supabase = await getSupabaseServerClient();
    const payload = {
      issuer_id: input.issuerId,
      template_id: input.templateId ?? null,
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

    const { count, error } = await q.select("id", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  },
};
