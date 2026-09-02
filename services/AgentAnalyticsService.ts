import { getSupabaseServerClient } from "../lib/supabase/server";

export const AgentAnalyticsService = {
  async track(input: { action: string; issuerId?: string; organizationId?: string; userId?: string; metadata?: Record<string, unknown>; }) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.from("audit_logs").insert({
      organization_id: input.organizationId ?? null,
      issuer_id: input.issuerId ?? null,
      user_id: input.userId ?? null,
      action: input.action,
      entity_type: "agent",
      metadata: input.metadata ?? {},
    });
    if (error) throw error;
  },
  async summary() {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("audit_logs").select("action").eq("entity_type", "agent");
    if (error) throw error;

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      counts.set(row.action, (counts.get(row.action) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((left, right) => right.count - left.count);
  },
};