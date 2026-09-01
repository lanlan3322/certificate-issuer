import { getSupabaseServerClient } from "../lib/supabase/server";

export interface IssuerInput { organizationId: string; name: string; slug: string; contactEmail: string; didUri?: string; }
export interface IssuerRecord extends IssuerInput { id: string; status: "active" | "disabled" | "suspended"; createdAt: string; }

const mapRow = (row: Record<string, unknown>): IssuerRecord => ({
  id: String(row.id),
  organizationId: String(row.organization_id),
  name: String(row.name),
  slug: String(row.slug),
  contactEmail: String(row.contact_email),
  didUri: row.did_uri ? String(row.did_uri) : undefined,
  status: row.status as IssuerRecord["status"],
  createdAt: String(row.created_at),
});

export const IssuerService = {
  async list(organizationId: string) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("issuers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async create(input: IssuerInput) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("issuers")
      .insert({
        organization_id: input.organizationId,
        name: input.name,
        slug: input.slug,
        contact_email: input.contactEmail,
        did_uri: input.didUri ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return mapRow(data);
  },

  async updateStatus(id: string, status: IssuerRecord["status"], organizationId: string) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("issuers")
      .update({ status })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error("Issuer not found.");
    return mapRow(data);
  },

  async update(id: string, organizationId: string, input: { name?: string; contactEmail?: string; didUri?: string | null }) {
    const supabase = await getSupabaseServerClient();
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.contactEmail !== undefined) updates.contact_email = input.contactEmail;
    if (input.didUri !== undefined) updates.did_uri = input.didUri;

    const { data, error } = await supabase
      .from("issuers")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error("Issuer not found.");
    return mapRow(data);
  },
};
