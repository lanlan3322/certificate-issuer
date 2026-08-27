import { query } from "../lib/db";

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

const mapEvent = (row: Record<string, unknown>): AuditEventRecord => ({
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
  /**
   * Audit writes must never break the operation being audited, so failures are
   * logged and swallowed.
   */
  async record(input: AuditEventInput) {
    try {
      await query(
        "INSERT INTO audit_logs (organization_id,issuer_id,user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [
          input.organizationId ?? null,
          input.issuerId ?? null,
          input.userId ?? null,
          input.action,
          input.entityType,
          input.entityId ?? null,
          JSON.stringify(input.metadata ?? {}),
        ]
      );
    } catch (error) {
      console.error("Audit write failed", { action: input.action, error });
    }
  },

  async list(organizationId: string, options: { limit?: number; entityType?: string; since?: string } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM audit_logs
       WHERE organization_id = $1
         AND ($2::text IS NULL OR entity_type = $2)
         AND ($3::timestamptz IS NULL OR created_at >= $3)
       ORDER BY created_at DESC
       LIMIT $4`,
      [organizationId, options.entityType ?? null, options.since ?? null, limit]
    );
    return result.rows.map(mapEvent);
  },

  async summary(organizationId: string, days = 30) {
    const [byAction, byDay, totals] = await Promise.all([
      query<{ action: string; count: number }>(
        `SELECT action, count(*)::int AS count FROM audit_logs
         WHERE organization_id = $1 AND created_at >= now() - ($2 || ' days')::interval
         GROUP BY action ORDER BY count DESC LIMIT 20`,
        [organizationId, String(days)]
      ),
      query<{ day: string; count: number }>(
        `SELECT date_trunc('day', created_at)::date::text AS day, count(*)::int AS count
         FROM audit_logs
         WHERE organization_id = $1 AND created_at >= now() - ($2 || ' days')::interval
         GROUP BY 1 ORDER BY 1`,
        [organizationId, String(days)]
      ),
      query<{ issued: number; revoked: number; suspended: number; verifications: number }>(
        `SELECT
           (SELECT count(*)::int FROM credentials c JOIN issuers i ON i.id=c.issuer_id
             WHERE i.organization_id=$1 AND c.status='issued') AS issued,
           (SELECT count(*)::int FROM credentials c JOIN issuers i ON i.id=c.issuer_id
             WHERE i.organization_id=$1 AND c.status='revoked') AS revoked,
           (SELECT count(*)::int FROM credentials c JOIN issuers i ON i.id=c.issuer_id
             WHERE i.organization_id=$1 AND c.status='suspended') AS suspended,
           (SELECT count(*)::int FROM verification_logs v
             JOIN credentials c ON c.id=v.credential_id
             JOIN issuers i ON i.id=c.issuer_id
             WHERE i.organization_id=$1) AS verifications`,
        [organizationId]
      ),
    ]);

    return {
      byAction: byAction.rows,
      byDay: byDay.rows,
      totals: totals.rows[0] ?? { issued: 0, revoked: 0, suspended: 0, verifications: 0 },
    };
  },
};
