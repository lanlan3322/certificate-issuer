import { getSupabaseServerClient } from "../lib/supabase/server";
import type { IssuerMemberRole } from "../lib/permissions";

const mapRow = (row: Record<string, unknown>) => ({
  issuerId: String(row.issuer_id), userId: String(row.user_id),
  role: row.role as IssuerMemberRole, createdAt: String(row.created_at),
});

export const IssuerMemberService = {
  async list(issuerId: string) {
    const { data, error } = await (await getSupabaseServerClient()).from("issuer_members")
      .select("*").eq("issuer_id", issuerId).order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },
  async save(issuerId: string, userId: string, role: IssuerMemberRole) {
    const { data, error } = await (await getSupabaseServerClient()).from("issuer_members")
      .upsert({ issuer_id: issuerId, user_id: userId, role }, { onConflict: "issuer_id,user_id" }).select().single();
    if (error) throw error;
    return mapRow(data);
  },
  async remove(issuerId: string, userId: string) {
    const { data, error } = await (await getSupabaseServerClient()).from("issuer_members")
      .delete().eq("issuer_id", issuerId).eq("user_id", userId).select("user_id");
    if (error) throw error;
    if (!data?.length) throw new Error("Issuer member not found.");
  },
};
