import { getSupabaseAdmin } from "../lib/supabase/server";
import { isPlanId } from "../lib/billing";
import type { BillingSnapshot, BillingMetrics, PlanId, Subscription, SubscriptionDirectory } from "../lib/billing";

export class SubscriptionError extends Error {
  constructor(message = "Billing information is unavailable.", public readonly status = 503) { super(message); }
}
export interface SubscriptionAssignment {
  plan: PlanId;
  status: Subscription["status"];
  version: number;
  billable: boolean;
  monthlyPriceCents: number;
  renewsAt: string | null;
  expiresAt: string | null;
  renew: boolean;
}
export function parseAssignment(body: Record<string, unknown>): SubscriptionAssignment {
  if (!isPlanId(body.plan) || typeof body.status !== "string" ||
    !["pending", "active", "suspended", "expired", "canceled"].includes(body.status) ||
    !Number.isSafeInteger(body.version) || Number(body.version) < 1 ||
    typeof body.billable !== "boolean" || typeof body.renew !== "boolean" ||
    !Number.isSafeInteger(body.monthlyPriceCents) || Number(body.monthlyPriceCents) < 0 ||
    Number(body.monthlyPriceCents) > 2_147_483_647) {
    throw new SubscriptionError("Provide a valid plan, status, version and monthly contract price.", 400);
  }
  const date = (value: unknown) => {
    if (value === null) return null;
    if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) {
      throw new SubscriptionError("Renewal and expiry must be valid ISO dates or null.", 400);
    }
    return new Date(value).toISOString();
  };
  return { plan: body.plan, status: body.status as Subscription["status"], version: Number(body.version),
    billable: body.billable, monthlyPriceCents: Number(body.monthlyPriceCents),
    renewsAt: date(body.renewsAt), expiresAt: date(body.expiresAt), renew: body.renew };
}
export const SubscriptionService = {
  async directory(offset: number): Promise<SubscriptionDirectory> {
    const { data, error } = await getSupabaseAdmin().rpc("subscription_directory", { p_offset: offset });
    if (error || !data) throw new SubscriptionError("Subscription directory is unavailable.");
    return data;
  },
  async snapshot(organizationId: string): Promise<BillingSnapshot> {
    const { data, error } = await getSupabaseAdmin().rpc("subscription_snapshot", { p_org: organizationId });
    if (error) throw new SubscriptionError();
    if (!data) throw new SubscriptionError("Subscription not found. Contact a platform administrator.", 404);
    return data;
  },
  async metrics(): Promise<BillingMetrics> {
    const { data, error } = await getSupabaseAdmin().rpc("subscription_platform_metrics");
    if (error || !data) throw new SubscriptionError("Platform billing metrics are unavailable.");
    return { ...data, arrCents: data.mrrCents * 12 };
  },
  async action(organizationId: string, actorId: string, action: "request" | "assign", payload: Record<string, unknown>) {
    const { error } = await getSupabaseAdmin().rpc("subscription_admin_action", {
      p_org: organizationId, p_actor: actorId, p_action: action, p_payload: payload,
    });
    if (error) throw new SubscriptionError("Subscription update failed. Refresh and check your permissions, pending request, dates and contracted price.", 409);
  },
};
