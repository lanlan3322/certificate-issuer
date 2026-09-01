import { getSupabaseServerClient } from "../lib/supabase/server";

export interface AuditEventInput {
  organizationId?: string;
  issuerId?: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEventRecord {
  id: string;
  organizationId: string | null;
  issuerId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const mapRow = (row: Record<string, unknown>): AuditEventRecord => ({
  id: String(row.id),
  organizationId: row.organization_id ? String(row.organization_id) : null,
  issuerId: row.issuer_id ? String(row.issuer_id) : null,
  userId: row.user_id ? String(row.user_id) : null,
  action: String(row.action),
  entityType: String(row.entity_type),
  entityId: row.entity_id ? String(row.entity_id) : null,
  metadata: (row.metadata as Record<string, unknown>) ?? {},
  createdAt: String(row.created_at),
});

export const AuditService = {
  async record(input: AuditEventInput) {
    try {
      const supabase = await getSupabaseServerClient();
      const { error } = await supabase.from("audit_logs").insert({
        organization_id: input.organizationId ?? null,
        issuer_id: input.issuerId ?? null,
        user_id: input.userId ?? null,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
      });
      if (error) console.error("Audit write failed", { action: input.action, error });
    } catch (error) {
      console.error("Audit write failed", { action: input.action, error });
    }
  },

  async list(organizationId: string, options: { limit?: number; entityType?: string; since?: string } = {}) {
    const supabase = await getSupabaseServerClient();
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

    let q = supabase
      .from("audit_logs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (options.entityType) q = q.eq("entity_type", options.entityType);
    if (options.since) q = q.gte("created_at", options.since);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async summary(organizationId: string, days = 30) {
    const supabase = await getSupabaseServerClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Totals from credentials table (these are the most important metrics)
    const [issued, revoked, suspended, verifications] = await Promise.all([
      supabase.from("credentials").select("id", { count: "exact" }).eq("status", "issued"),
      supabase.from("credentials").select("id", { count: "exact" }).eq("status", "revoked"),
      supabase.from("credentials").select("id", { count: "exact" }).eq("status", "suspended"),
      supabase.from("verification_logs").select("id", { count: "exact" }),
    ]);

    // By action — fetch all audit logs for the period and group client-side
    const { data: logs, error } = await supabase
      .from("audit_logs")
      .select("action")
      .eq("organization_id", organizationId)
      .gte("created_at", since);
    if (error) throw error;

    const actionCounts: Record<string, number> = {};
    (logs ?? []).forEach((row: any) => {
      const a = row.action;
      actionCounts[a] = (actionCounts[a] ?? 0) + 1;
    });
    const byAction = Object.entries(actionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([action, count]) => ({ action, count }));

    return {
      byAction,
      byDay: [],
      totals: {
        issued: issued.count ?? 0,
        revoked: revoked.count ?? 0,
        suspended: suspended.count ?? 0,
        verifications: verifications.count ?? 0,
      },
    };
  },
};
