import { getSupabaseServerClient } from "../lib/supabase/server";

export type MembershipRole = "organization_admin" | "issuer" | "viewer";
export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): OrganizationMember {
  return { id: String(row.id), organizationId: String(row.organization_id), userId: String(row.user_id),
    role: row.role as MembershipRole, createdAt: String(row.created_at) };
}

export const OrganizationMemberService = {
  async list(organizationId: string) {
    const client = await getSupabaseServerClient();
    const { data, error } = await client.from("organization_members").select("*")
      .eq("organization_id", organizationId).order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },
  async add(organizationId: string, userId: string, role: MembershipRole) {
    const client = await getSupabaseServerClient();
    const { data, error } = await client.from("organization_members")
      .insert({ organization_id: organizationId, user_id: userId, role }).select().single();
    if (error) throw error;
    return mapRow(data);
  },
  async remove(organizationId: string, userId: string) {
    const client = await getSupabaseServerClient();
    const { data, error } = await client.from("organization_members").delete()
      .eq("organization_id", organizationId).eq("user_id", userId).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Organization member not found.");
  },
  async update(organizationId: string, userId: string, role: MembershipRole) {
    const client = await getSupabaseServerClient();
    const { data, error } = await client.from("organization_members").update({ role })
      .eq("organization_id", organizationId).eq("user_id", userId).select().single();
    if (error) throw error;
    return mapRow(data);
  },
};
