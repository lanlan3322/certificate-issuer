import { getSupabaseServerClient } from "../lib/supabase/server";

export interface OrganizationInput {
  name: string;
  slug: string;
  displayName?: string;
  website?: string | null;
  logoUrl?: string | null;
  status?: "active" | "disabled";
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  status: "active" | "disabled";
  createdAt: string;
  displayName: string;
  website: string | null;
  logoUrl: string | null;
  createdBy: string | null;
  updatedAt: string;
  softDeletedAt: string | null;
}

const mapRow = (row: Record<string, unknown>): OrganizationRecord => ({
  id: String(row.id),
  name: String(row.name),
  slug: String(row.slug),
  status: (row.status as "active" | "disabled") ?? "active",
  createdAt: String(row.created_at),
  displayName: String(row.display_name ?? row.name),
  website: row.website ? String(row.website) : null,
  logoUrl: row.logo_url ? String(row.logo_url) : null,
  createdBy: row.created_by ? String(row.created_by) : null,
  updatedAt: String(row.updated_at),
  softDeletedAt: row.soft_deleted_at ? String(row.soft_deleted_at) : null,
});

export const OrganizationService = {
  async create(input: OrganizationInput, userId: string): Promise<OrganizationRecord> {
    const supabase = await getSupabaseServerClient();

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: input.name, slug: input.slug, display_name: input.displayName || input.name,
        website: input.website ?? null, logo_url: input.logoUrl ?? null,
        status: input.status ?? "active", created_by: userId })
      .select()
      .single();

    if (orgError) throw new Error(`Failed to create organization: ${orgError.message}`);

    return mapRow(org);
  },

  async get(userId: string): Promise<OrganizationRecord | null> {
    const supabase = await getSupabaseServerClient();
    const { data: appUser, error } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (error || !appUser?.organization_id) return null;

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", appUser.organization_id)
      .maybeSingle();

    if (orgError || !org) return null;

    return mapRow(org);
  },

  async list(includeDisabled = false): Promise<OrganizationRecord[]> {
    const supabase = await getSupabaseServerClient();

    let query = supabase.from("organizations").select("*").is("soft_deleted_at", null);
    if (!includeDisabled) {
      query = query.eq("status", "active");
    }
    const { data: orgs, error } = await query.order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to list organizations: ${error.message}`);

    return (orgs ?? []).map(mapRow);
  },

  async getById(id: string): Promise<OrganizationRecord | null> {
    const supabase = await getSupabaseServerClient();
    const { data: org, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!org) return null;
    return mapRow(org);
  },

  async updateStatus(id: string, status: OrganizationRecord["status"]): Promise<OrganizationRecord> {
    return this.update(id, { status });
  },

  async update(id: string, input: Partial<OrganizationInput> & { softDeletedAt?: string }): Promise<OrganizationRecord> {
    const supabase = await getSupabaseServerClient();
    const updates: Record<string, unknown> = {};
    for (const [field, column] of [
      ["name", "name"], ["slug", "slug"], ["displayName", "display_name"], ["website", "website"],
      ["logoUrl", "logo_url"], ["status", "status"], ["softDeletedAt", "soft_deleted_at"],
    ] as const) {
      if (input[field] !== undefined) updates[column] = input[field];
    }

    const { data: org, error } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", id)
      .is("soft_deleted_at", null)
      .select()
      .single();

    if (error) throw new Error(`Failed to update organization status: ${error.message}`);
    if (!org) throw new Error("Organization not found.");

    return mapRow(org);
  },
};
