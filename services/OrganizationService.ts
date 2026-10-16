import { getSupabaseAdmin, getSupabaseServerClient } from "../lib/supabase/server";

export interface OrganizationInput {
  name: string;
  slug: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  status: "active" | "disabled";
  createdAt: string;
}

const mapRow = (row: Record<string, unknown>): OrganizationRecord => ({
  id: String(row.id),
  name: String(row.name),
  slug: String(row.slug),
  status: (row.status as "active" | "disabled") ?? "active",
  createdAt: String(row.created_at),
});

export const OrganizationService = {
  async create(input: OrganizationInput, userId: string): Promise<OrganizationRecord> {
    const supabase = getSupabaseAdmin();

    // Insert the organization
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: input.name, slug: input.slug })
      .select()
      .single();

    if (orgError) throw new Error(`Failed to create organization: ${orgError.message}`);

    // Link the user to this organization
    const { error: linkError } = await supabase
      .from("users")
      .update({ organization_id: org.id })
      .eq("auth_user_id", userId);

    if (linkError) throw new Error(`Failed to link user to organization: ${linkError.message}`);

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

  async list(): Promise<OrganizationRecord[]> {
    const supabase = getSupabaseAdmin();

    const { data: orgs, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to list organizations: ${error.message}`);

    return (orgs ?? []).map(mapRow);
  },
};

