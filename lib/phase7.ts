export type AuditAction = "issued" | "revoked" | "suspended" | "reinstate" | "verified";
export type AuditStatus = "success" | "failed" | "pending";

export interface AuditEvent {
  id: string;
  credentialId: string;
  actor: string;
  action: AuditAction;
  status: AuditStatus;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export function createAuditEvent(input: {
  credentialId: string;
  actor: string;
  action: AuditAction;
  status: AuditStatus;
  metadata?: Record<string, unknown>;
}): AuditEvent {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    credentialId: input.credentialId,
    actor: input.actor,
    action: input.action,
    status: input.status,
    occurredAt: new Date().toISOString(),
    metadata: input.metadata ?? {},
  };
}

export function buildComplianceSummary(events: AuditEvent[]): {
  totalEvents: number;
  statusCounts: Record<AuditStatus, number>;
  credentialIds: string[];
  latestEvent: AuditEvent | null;
} {
  const statusCounts: Record<AuditStatus, number> = {
    success: 0,
    failed: 0,
    pending: 0,
  };

  events.forEach((event) => {
    statusCounts[event.status] = (statusCounts[event.status] ?? 0) + 1;
  });

  const credentialIds = Array.from(new Set(events.map((event) => event.credentialId)));
  const latestEvent = events.length > 0 ? [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] : null;

  return {
    totalEvents: events.length,
    statusCounts,
    credentialIds,
    latestEvent,
  };
}
