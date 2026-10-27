import { getSupabaseAdmin, getSupabaseServerClient } from "../lib/supabase/server";

export interface TemplateInput {
  issuerId: string;
  slug: string;
  name: string;
  description?: string;
  definition?: Record<string, unknown>;
  issuerProfileId?: string | null;
}

export interface TemplateRecord {
  id: string;
  issuerId: string | null;
  issuerProfileId: string | null;
  slug: string;
  name: string;
  description: string;
  definition: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

const mapRow = (row: Record<string, unknown>): TemplateRecord => ({
  id: String(row.id),
  issuerId: row.issuer_id ? String(row.issuer_id) : null,
  issuerProfileId: row.issuer_profile_id ? String(row.issuer_profile_id) : null,
  slug: String(row.slug),
  name: String(row.name),
  description: row.description ? String(row.description) : "",
  definition: (row.definition as Record<string, unknown>) ?? {},
  isActive: row.is_active !== false,
  createdAt: String(row.created_at),
});

export const TemplateService = {
  async listForIssuance(scope: { organizationId: string; platformAdmin: boolean }) {
    const table = getSupabaseAdmin().from("templates");
    let query = (scope.platformAdmin
      ? table.select("*")
      : table.select("*, issuers!inner(organization_id)")).eq("is_active", true);
    if (!scope.platformAdmin) query = query.eq("issuers.organization_id", scope.organizationId);
    const { data, error } = await query.order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async getAvailableForIssuance(reference: string, scope: { organizationId: string; platformAdmin: boolean }) {
    const templates = await this.listForIssuance(scope);
    const byId = templates.find((template) => template.id === reference);
    if (byId) return byId;
    const bySlug = templates.filter((template) => template.slug === reference);
    if (bySlug.length > 1) throw new Error("Template slug is ambiguous. Select the saved template by ID.");
    return bySlug[0] ?? null;
  },

  async getForIssuance(reference: string, issuerId: string) {
    const supabase = await getSupabaseServerClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference);
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("issuer_id", issuerId)
      .eq(isUuid ? "id" : "slug", reference)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  },

  async list(issuerId: string, options: { includeInactive?: boolean } = {}) {
    const supabase = await getSupabaseServerClient();

    let queryBuilder = supabase
      .from("templates")
      .select("*")
      .or(`issuer_id.eq.${issuerId},issuer_id.is.null`)
      .order("created_at", { ascending: false });

    if (!options.includeInactive) {
      queryBuilder = queryBuilder.eq("is_active", true);
    }

    const { data, error } = await queryBuilder;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async get(id: string, issuerId: string) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .or(`id.eq.${id},issuer_id.is.null`)
      .eq("issuer_id", issuerId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  },

  async create(input: TemplateInput) {
    const supabase = await getSupabaseServerClient();
    await assertIssuerProfile(input.issuerProfileId, input.issuerId);
    const { data, error } = await supabase
      .from("templates")
      .insert({
        issuer_id: input.issuerId,
        issuer_profile_id: input.issuerProfileId ?? null,
        slug: input.slug,
        name: input.name,
        description: input.description ?? "",
        definition: JSON.stringify(input.definition ?? {}),
      })
      .select()
      .single();
    if (error) throw error;
    return mapRow(data);
  },

  async upsert(input: TemplateInput) {
    const supabase = await getSupabaseServerClient();
    let issuerProfileId = input.issuerProfileId;
    if (issuerProfileId === undefined) {
      const { data: existing, error: lookupError } = await supabase
        .from("templates")
        .select("issuer_profile_id")
        .eq("issuer_id", input.issuerId)
        .eq("slug", input.slug)
        .maybeSingle();
      if (lookupError) throw lookupError;
      issuerProfileId = existing?.issuer_profile_id
        ? String(existing.issuer_profile_id)
        : null;
    }
    await assertIssuerProfile(issuerProfileId, input.issuerId);
    const { data, error } = await supabase
      .from("templates")
      .upsert(
        {
          issuer_id: input.issuerId,
          issuer_profile_id: issuerProfileId ?? null,
          slug: input.slug,
          name: input.name,
          description: input.description ?? "",
          definition: JSON.stringify(input.definition ?? {}),
          is_active: true,
        },
        { onConflict: "issuer_id,slug" }
      )
      .select()
      .single();
    if (error) throw error;
    return mapRow(data);
  },

  async deactivate(id: string, issuerId: string) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("templates")
      .update({ is_active: false })
      .eq("id", id)
      .eq("issuer_id", issuerId)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error("Template not found.");
    return mapRow(data);
  },
};

async function assertIssuerProfile(issuerProfileId: string | null | undefined, issuerId: string) {
  if (!issuerProfileId) return;
  const { data, error } = await (await getSupabaseServerClient())
    .from("issuer_profiles")
    .select("id")
    .eq("id", issuerProfileId)
    .eq("owner_issuer_id", issuerId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Active issuer profile not found for this issuer.");
}
