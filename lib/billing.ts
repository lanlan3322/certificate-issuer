export type PlanId = "starter" | "professional" | "enterprise";
export const PLAN_IDS: readonly PlanId[] = ["starter", "professional", "enterprise"];
export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLAN_IDS.some(plan => plan === value);
}
export interface PlanLimits {
  id: PlanId;
  name: string;
  monthly_price_cents: number;
  issuer_limit: number | null;
  template_limit: number | null;
  certificate_limit: number | null;
}
export interface Subscription {
  organization_id: string;
  plan: PlanId;
  status: "pending" | "active" | "suspended" | "expired" | "canceled";
  started_at: string;
  renewed_at: string | null;
  renews_at: string | null;
  expires_at: string | null;
  billable: boolean;
  grandfathered: boolean;
  monthly_price_cents: number;
  version: number;
}
export interface BillingSnapshot {
  subscription: Subscription;
  limits: PlanLimits;
  usage: {
    month: string;
    certificatesIssued: number;
    issuersCreated: number;
    templatesCreated: number;
    issuers: number;
    templates: number;
    storageBytes: number;
  };
  request: { requested_plan: PlanId; created_at: string } | null;
}
export interface BillingMetrics {
  mrrCents: number;
  arrCents: number;
  organizations: number;
  activeIssuers: number;
  credentialsIssued: number;
  certificatesThisMonth: number;
  verificationVolume: number;
  subscriptions: number;
  activeSubscriptions: number;
  pendingRequests: number;
}
export interface SubscriptionDirectory {
  items: Array<{
    organizationId: string; organizationName: string; plan: PlanId;
    status: Subscription["status"]; renewsAt: string | null; expiresAt: string | null;
    monthlyPriceCents: number; billable: boolean; grandfathered: boolean; requestedPlan: PlanId | null;
  }>;
  hasMore: boolean;
}
export function usageWarnings(snapshot: BillingSnapshot): string[] {
  return ([
    ["Issuers", snapshot.usage.issuers, snapshot.limits.issuer_limit],
    ["Templates", snapshot.usage.templates, snapshot.limits.template_limit],
    ["Certificates this UTC month", snapshot.usage.certificatesIssued, snapshot.limits.certificate_limit],
  ] as const).flatMap(([label, used, limit]) => limit !== null && used >= Math.ceil(limit * 0.8)
    ? [`${label}: ${used}/${limit}${used >= limit ? " - limit reached; request an upgrade." : " - approaching plan limit."}`] : []);
}
export const formatSGD = (cents: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(cents / 100);
