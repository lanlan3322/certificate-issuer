"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspaceSession } from "./WorkspaceSession";
import { BillingMetricsPanel } from "./BillingDashboard";
import { hasPermission, isPlatformAdmin } from "../lib/permissions";
import type { BillingSnapshot } from "../lib/billing";
import { withBasePath } from "../lib/site";

interface Summary { organizations: number; issuers: number; templates: number; credentials: number; revocations: number; verifications: number }
interface TrustStatus {
  identities: Array<{ did: string; status: string }>;
  stores: Array<{ status: string; connection_status: string }>;
}

export default function WorkspaceOverview() {
  const { user } = useWorkspaceSession();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [trust, setTrust] = useState<TrustStatus | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const platform = isPlatformAdmin(user);
  const admin = hasPermission(user, "members.manage");
  const canReadBilling = hasPermission(user, "billing.read");
  useEffect(() => {
    setSummary(null); setBilling(null); setTrust(null); setErrors({});
    if (!user) return;
    const controller = new AbortController();
    async function request<T>(url: string): Promise<T> {
      const response = await fetch(withBasePath(url), { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load workspace information.");
      return body;
    }
    function failure(section: string, reason: unknown) {
      if (!controller.signal.aborted) setErrors(previous => ({ ...previous, [section]: reason instanceof Error ? reason.message : "Workspace information unavailable." }));
    }
    void request<Summary>("/api/workspace-summary").then(body => {
      if (!controller.signal.aborted) setSummary(body);
    }).catch(reason => failure("Programme summary", reason));
    if (canReadBilling && !platform) void request<BillingSnapshot>("/api/subscriptions").then(body => {
      if (!controller.signal.aborted) setBilling(body);
    }).catch(reason => failure("Subscription", reason));
    if (admin) void Promise.all([
      request<Pick<TrustStatus, "identities">>("/api/managed-dids"),
      request<Pick<TrustStatus, "stores">>("/api/organization-document-stores"),
    ]).then(([identity, stores]) => {
      if (!controller.signal.aborted) setTrust({ ...identity, ...stores });
    }).catch(reason => failure("Identity & Trust", reason));
    return () => controller.abort();
  }, [user, admin, canReadBilling, platform]);
  if (!user) return null;
  const cards = summary ? [
    ["Organizations", summary.organizations], ["Active issuers", summary.issuers],
    ["Active templates", summary.templates], ["Credentials issued", summary.credentials],
    ["Currently revoked", summary.revocations], ["Recorded verification checks", summary.verifications],
  ] as const : [];
  return <section aria-label="Credential programme overview" className="mb-8 space-y-5">
    {Object.entries(errors).map(([section, error]) => <p role="alert" key={section} className="rounded-xl border border-red-300 p-4 text-sm">{section}: {error}</p>)}
    {!summary && !errors["Programme summary"] && <p role="status">Loading programme summary...</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value]) => <div key={label} className="stat-card"><p className="text-sm text-slate-600 dark:text-slate-300">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p></div>)}</div>
    <p className="text-xs text-slate-500">Counts cover records accessible to your role and issuer memberships. Verification checks include recorded checks linked to those credentials, not unique visitors.</p>
    {canReadBilling && !platform && <section className="card" aria-label="Subscription status">
      <h2 className="text-lg font-semibold">Subscription & capacity</h2>
      {billing ? <><p className="mt-3 capitalize">{billing.limits.name} · {billing.subscription.expires_at && Date.parse(billing.subscription.expires_at) <= Date.now() ? "expired" : billing.subscription.status}</p>
        <p className="mt-2 text-sm">{billing.usage.certificatesIssued.toLocaleString()} credentials this UTC month / {billing.limits.certificate_limit?.toLocaleString() ?? "Unlimited"}</p>
        <p className="mt-2 text-sm">Renewal: {billing.subscription.renews_at ? new Date(billing.subscription.renews_at).toLocaleDateString() : "Not scheduled"}</p></> : !errors.Subscription && <p role="status">Loading subscription...</p>}
      <Link href="/billing" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300">Review plan, limits & usage</Link>
    </section>}
    {admin && <section className="card" aria-label="Identity and Document Store status"><h2 className="text-lg font-semibold">Identity & Trust</h2>
      {trust ? <><p className="mt-3 break-all text-sm">Managed DID: {trust.identities.find(identity => identity.status === "active")?.did ?? "No active managed DID"}</p>
        <p className="mt-2 text-sm">Organization Document Store: {trust.stores.some(store => store.status === "active" && store.connection_status === "ok") ? "Active · last connection test passed" : trust.stores.some(store => store.status === "active") ? "Active · connection needs attention" : "No active organization store · legacy/template fallback may apply"}</p>
        <p className="mt-2 text-xs text-slate-500">Identity and store status reflect your current organization, including for platform administrators. Customer-hosted issuance mode is shown in DID Management; this is not a live chain health check.</p></> : !errors["Identity & Trust"] && <p role="status">Loading trust status...</p>}
      <Link href="/identity-trust" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300">Manage identity & trust</Link>
    </section>}
    {platform && <BillingMetricsPanel />}
  </section>;
}
