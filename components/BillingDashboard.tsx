"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspaceSession } from "./WorkspaceSession";
import { hasPermission, isPlatformAdmin } from "../lib/permissions";
import { formatSGD, PLAN_IDS } from "../lib/billing";
import type { BillingSnapshot, BillingMetrics, PlanId, Subscription, SubscriptionDirectory } from "../lib/billing";
import { withBasePath } from "../lib/site";

const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString() : "Not scheduled";
const dateInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 10) : "";

export function SubscriptionDirectoryPanel({ onSelect, disabled = false }: { onSelect: (id: string) => void; disabled?: boolean }) {
  const [offset, setOffset] = useState(0);
  const [directory, setDirectory] = useState<SubscriptionDirectory | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setDirectory(null); setError(null);
    void fetch(withBasePath(`/api/subscriptions?scope=directory&offset=${offset}`), { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load subscription directory.");
        if (!controller.signal.aborted) setDirectory(body);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load subscription directory."); });
    return () => controller.abort();
  }, [offset]);
  return <section aria-label="Subscription directory" className="space-y-3">
    <h2 className="text-xl font-semibold">Subscriptions & plan requests</h2>
    <p className="text-sm text-slate-500">Pending requests appear first. Select an organization to review and assign its contract.</p>
    {error ? <p role="alert">{error}</p> : !directory ? <p role="status">Loading subscriptions...</p> :
      <>
        <div className="overflow-x-auto" role="region" aria-label="Organization subscriptions" tabIndex={0}>
          <table className="w-full text-left text-sm">
            <thead><tr>{["Organization", "Plan", "Status", "Next renewal", "Contract / month", "Requested plan", "Review"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
            <tbody>{directory.items.map(item => <tr key={item.organizationId}>
              <td className="p-3">{item.organizationName}</td><td className="p-3">{item.plan}</td>
              <td className="p-3">{item.expiresAt && Date.parse(item.expiresAt) <= Date.now() ? "expired" : item.status}</td>
              <td className="p-3">{dateLabel(item.renewsAt)}</td>
              <td className="p-3">{item.billable ? formatSGD(item.monthlyPriceCents) : item.grandfathered ? "Grandfathered" : "Non-billable"}</td>
              <td className="p-3">{item.requestedPlan ?? "None"}</td>
              <td className="p-3"><button type="button" className="btn-secondary min-h-11" disabled={disabled} onClick={() => onSelect(item.organizationId)} aria-label={`Review ${item.organizationName}`}>Review</button></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!directory.items.length && <p>No subscriptions found.</p>}
        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary min-h-11" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
          <span>Page {offset / 50 + 1}</span>
          <button type="button" className="btn-secondary min-h-11" disabled={!directory.hasMore} onClick={() => setOffset(offset + 50)}>Next</button>
        </div>
      </>}
  </section>;
}

export function BillingMetricsPanel() {
  const [metrics, setMetrics] = useState<BillingMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(withBasePath("/api/subscriptions?scope=platform"), { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load subscription metrics.");
        if (!controller.signal.aborted) setMetrics(body.metrics);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load subscription metrics."); });
    return () => controller.abort();
  }, []);
  return <section aria-label="Commercial platform metrics" className="space-y-4">
    <h2 className="text-xl font-semibold">Subscription & revenue overview</h2>
    <p className="text-sm text-slate-500">SGD contracted recurring run rate, not cash collected. Grandfathered and non-billable accounts are excluded. ARR is MRR multiplied by 12.</p>
    {error ? <p role="alert">{error}</p> : !metrics ? <p role="status">Loading subscription metrics...</p> :
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["MRR", formatSGD(metrics.mrrCents)], ["ARR", formatSGD(metrics.arrCents)],
          ["Organizations", metrics.organizations], ["Active issuers", metrics.activeIssuers],
          ["Credentials issued", metrics.credentialsIssued], ["Certificates this UTC month", metrics.certificatesThisMonth],
          ["Recorded verification checks", metrics.verificationVolume], ["Subscriptions", metrics.subscriptions],
          ["Active subscriptions", metrics.activeSubscriptions], ["Pending plan requests", metrics.pendingRequests],
        ].map(([label, value]) => <div key={label} className="stat-card"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p></div>)}
      </div>}
  </section>;
}

export default function BillingDashboard() {
  const { user } = useWorkspaceSession();
  const platform = isPlatformAdmin(user);
  const allowed = hasPermission(user, "billing.read");
  const [organizations, setOrganizations] = useState<Array<{ id: string; displayName: string }>>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [snapshot, setSnapshot] = useState<(BillingSnapshot & { warnings: string[] }) | null>(null);
  const [plan, setPlan] = useState<PlanId>("starter");
  const [status, setStatus] = useState<Subscription["status"]>("active");
  const [billable, setBillable] = useState(false);
  const [price, setPrice] = useState("899");
  const [renewsAt, setRenewsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [renew, setRenew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [metricsVersion, setMetricsVersion] = useState(0);
  const lock = useRef(false);
  const scope = useRef("");
  scope.current = `${user?.id}:${organizationId}`;
  function apply(body: BillingSnapshot & { warnings: string[] }) {
    setSnapshot(body); setPlan(body.subscription.plan); setStatus(body.subscription.status);
    setBillable(body.subscription.billable);
    setPrice(String((body.subscription.monthly_price_cents || 89900) / 100));
    setRenewsAt(dateInput(body.subscription.renews_at)); setExpiresAt(dateInput(body.subscription.expires_at)); setRenew(false);
  }
  useEffect(() => {
    setOrganizationId(user?.organizationId ?? ""); setSnapshot(null);
    if (!platform) { setOrganizations([]); return; }
    const controller = new AbortController();
    void fetch(withBasePath("/api/organizations"), { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load organizations.");
        if (!controller.signal.aborted) setOrganizations(body.organizations);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load organizations."); });
    return () => controller.abort();
  }, [user?.id, user?.organizationId, platform]);
  useEffect(() => {
    setSnapshot(null); setError(null); setNotice(null);
    if (!organizationId || !allowed) return;
    const controller = new AbortController(); setLoading(true);
    void fetch(withBasePath(`/api/subscriptions?organizationId=${encodeURIComponent(organizationId)}`), { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load subscription.");
        if (!controller.signal.aborted) apply(body);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load subscription."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [organizationId, allowed]);
  async function submit() {
    if (!snapshot || lock.current) return;
    if (platform && !window.confirm("Apply this subscription contract and its limits? No payment will be collected. Downgrades may block new creation immediately.")) return;
    const requestScope = scope.current;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(withBasePath(`/api/subscriptions?organizationId=${encodeURIComponent(organizationId)}`), {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(platform ? {
          action: "assign", plan, status, version: snapshot.subscription.version, billable,
          monthlyPriceCents: plan === "enterprise" ? Math.round(Number(price) * 100) : plan === "starter" ? 4900 : 29900,
          renewsAt: renewsAt ? `${renewsAt}T00:00:00Z` : null, expiresAt: expiresAt ? `${expiresAt}T00:00:00Z` : null, renew,
        } : { action: "request", plan }),
      });
      const body = await response.json();
      if (requestScope !== scope.current) return;
      if (!response.ok) throw new Error(body.error || "Subscription update failed.");
      apply(body); setNotice(platform ? "Subscription updated. No payment collected." : "Plan request submitted for platform approval. Your current plan is unchanged.");
      if (platform) setMetricsVersion(metricsVersion + 1);
    } catch (reason) { if (requestScope === scope.current) setError(reason instanceof Error ? reason.message : "Subscription update failed."); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!allowed) return <p role="alert">Organization or platform administrator access is required.</p>;
  return <div className="space-y-8">
    {platform && <BillingMetricsPanel key={metricsVersion} />}
    {platform && <SubscriptionDirectoryPanel key={`directory-${metricsVersion}`} onSelect={setOrganizationId} disabled={busy} />}
    {platform && <label className="block font-semibold">Organization
      <select className="input-field mt-2 w-full" disabled={busy} value={organizationId} onChange={event => setOrganizationId(event.target.value)}>
        <option value="">Select an organization</option>
        {organizationId && !organizations.some(org => org.id === organizationId) && <option value={organizationId}>{organizationId}</option>}
        {organizations.map(org => <option key={org.id} value={org.id}>{org.displayName}</option>)}
      </select>
    </label>}
    {loading && <p role="status">Loading subscription...</p>}
    {error && <p role="alert" className="rounded-lg border border-red-300 p-3">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {snapshot && <>
      <section className="card space-y-3" aria-label="Current subscription">
        {platform && <p className="break-all text-sm">Organization: {organizations.find(org => org.id === organizationId)?.displayName ?? organizationId}</p>}
        <h2 className="text-xl font-semibold">{snapshot.limits.name} plan</h2>
        <p>Status: {snapshot.subscription.expires_at && Date.parse(snapshot.subscription.expires_at) <= Date.now() ? "expired" : snapshot.subscription.status}</p>
        <p>{snapshot.subscription.grandfathered ? "Grandfathered Enterprise access - no billing." :
          snapshot.subscription.billable ? `${formatSGD(snapshot.subscription.monthly_price_cents)} / month contracted` : "Non-billable account"}</p>
        <p>Next renewal: {dateLabel(snapshot.subscription.renews_at)}</p>
        <p>Last renewal: {dateLabel(snapshot.subscription.renewed_at)}. Expires: {dateLabel(snapshot.subscription.expires_at)}</p>
        {snapshot.warnings.map(warning => <p role="status" key={warning} className="rounded-lg border border-amber-400 p-3">{warning}</p>)}
        <dl className="grid gap-4 sm:grid-cols-3">
          {[
            ["Issuers", snapshot.usage.issuers, snapshot.limits.issuer_limit],
            ["Templates", snapshot.usage.templates, snapshot.limits.template_limit],
            ["Certificates this UTC month", snapshot.usage.certificatesIssued, snapshot.limits.certificate_limit],
          ].map(([label, used, limit]) => <div key={label}><dt>{label}</dt><dd className="text-lg font-semibold">{used} / {limit ?? "Unlimited"}</dd></div>)}
        </dl>
        <p className="text-sm">Created this UTC month: {snapshot.usage.issuersCreated} issuers, {snapshot.usage.templatesCreated} templates. Stored credential/template JSON: {Number(snapshot.usage.storageBytes).toLocaleString()} bytes (not total database or object storage).</p>
        <p className="text-sm">Deactivated templates still occupy a slot. Non-deleted issuers count, including inactive issuers. Revocation does not refund monthly issuance. Allowances reset on the first day of each UTC month; no carry-forward.</p>
        {snapshot.request && <p role="status">Pending request: {snapshot.request.requested_plan}. A platform administrator must review it.</p>}
      </section>
      <form className="card space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <h2 className="text-xl font-semibold">{platform ? "Assign subscription" : "Request a plan change"}</h2>
        <label className="block text-sm font-semibold">Plan
          <select className="input-field mt-2 w-full" disabled={busy} value={plan} onChange={event => setPlan(event.target.value as PlanId)}>
            {PLAN_IDS.map(id => <option key={id} value={id}>{id === "starter" ? "Starter - SGD 49/month" : id === "professional" ? "Professional - SGD 299/month" : "Enterprise - from SGD 899/month"}</option>)}
          </select>
        </label>
        {platform && <>
          <label className="block text-sm font-semibold">Status
            <select className="input-field mt-2 w-full" disabled={busy} value={status} onChange={event => setStatus(event.target.value as Subscription["status"])}>
              {["pending", "active", "suspended", "expired", "canceled"].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={billable} disabled={busy} onChange={event => setBillable(event.target.checked)} />Billable contract (included in recurring revenue while active)</label>
          {plan === "enterprise" && billable && <label className="block text-sm font-semibold">Contracted monthly price (SGD)
            <input className="input-field mt-2 w-full" type="number" min="899" max="21474836.47" step="0.01" required value={price} disabled={busy} onChange={event => setPrice(event.target.value)} />
          </label>}
          <label className="block text-sm font-semibold">Next renewal (UTC)
            <input className="input-field mt-2 w-full" type="date" value={renewsAt} disabled={busy} onChange={event => setRenewsAt(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">Access expires (UTC, optional)
            <input className="input-field mt-2 w-full" type="date" value={expiresAt} disabled={busy} onChange={event => setExpiresAt(event.target.value)} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={renew} disabled={busy} onChange={event => setRenew(event.target.checked)} />Record renewal now (does not reset UTC monthly usage)</label>
        </>}
        <p className="text-sm">Online payments are not connected. Changes require platform approval; no checkout, automatic charges or tax calculation is performed.</p>
        <button type="submit" className="btn-primary min-h-11" disabled={busy || (!platform && !!snapshot.request)}>{busy ? "Saving..." : platform ? "Apply subscription" : "Request plan change"}</button>
      </form>
    </>}
  </div>;
}
