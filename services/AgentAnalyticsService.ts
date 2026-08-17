import { query } from "../lib/db";
export const AgentAnalyticsService = {
  async track(input: { action: string; issuerId?: string; organizationId?: string; userId?: string; metadata?: Record<string, unknown>; }) { await query("INSERT INTO audit_logs (organization_id,issuer_id,user_id,action,entity_type,metadata) VALUES ($1,$2,$3,$4,'agent',$5)", [input.organizationId ?? null, input.issuerId ?? null, input.userId ?? null, input.action, JSON.stringify(input.metadata ?? {})]); },
  async summary() { const result = await query<Record<string, unknown>>("SELECT action, count(*)::int AS count FROM audit_logs WHERE entity_type='agent' GROUP BY action ORDER BY count DESC"); return result.rows; },
};