import { getSupabaseServerClient } from "../lib/supabase/server";

export interface TemplateInput {
  issuerId: string;
  slug: string;
  name: string;
  description?: string;
  definition?: Record<string, unknown>;
}

export interface TemplateRecord {
  id: string;
  issuerId: string | null;
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
  slug: String(row.slug),
  name: String(row.name),
  description: row.description ? String(row.description) : "",
  definition: (row.definition as Record<string, unknown>) ?? {},
  isActive: row.is_active !== false,
  createdAt: String(row.created_at),
});

export const TemplateService = {
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
    const { data, error } = await supabase
      .from("templates")
      .insert({
        issuer_id: input.issuerId,
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
    const { data, error } = await supabase
      .from("templates")
      .upsert(
        {
          issuer_id: input.issuerId,
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
