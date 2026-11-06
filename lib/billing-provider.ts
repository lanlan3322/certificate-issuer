import type { PlanId } from "./billing";

export interface BillingCheckout {
  organizationId: string;
  plan: PlanId;
  currency: "SGD";
  monthlyPriceCents: number;
  idempotencyKey: string;
}
export interface VerifiedBillingEvent {
  provider: string;
  eventId: string;
  organizationId: string;
  subscriptionReference: string;
  occurredAt: string;
  type: "subscription.activated" | "subscription.renewed" | "subscription.suspended" | "subscription.canceled";
}
/** Adapters must verify webhook authenticity before returning normalized events. */
export interface BillingProvider {
  readonly id: string;
  createCheckout(input: BillingCheckout): Promise<{ url: string; reference: string }>;
  createCustomerPortal(organizationId: string): Promise<{ url: string }>;
  verifyWebhook(body: Uint8Array, headers: Headers): Promise<VerifiedBillingEvent>;
}
export class BillingProviderUnavailableError extends Error {
  constructor() { super("Online payments are not connected. Contact a platform administrator to arrange a subscription."); }
}
export function requireBillingProvider(providers: readonly BillingProvider[], id: string): BillingProvider {
  const provider = providers.find(candidate => candidate.id === id);
  if (!provider) throw new BillingProviderUnavailableError();
  return provider;
}
