import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, FileCheck2, KeyRound, ShieldCheck, Sparkles } from "lucide-react";

const metrics = [
  { label: "Active issuers", value: "24", tone: "bg-slate-900 text-white" },
  { label: "Verified credentials", value: "18.4k", tone: "bg-cyan-100 text-cyan-800" },
  { label: "DID documents", value: "31", tone: "bg-emerald-100 text-emerald-800" },
  { label: "Revocations", value: "142", tone: "bg-amber-100 text-amber-800" },
];

const issuerQueue = [
  { name: "IMDA Academy", status: "Active", org: "Government", lead: "Alicia" },
  { name: "OpenClaw Labs", status: "Pending", org: "Training", lead: "Marcus" },
  { name: "Northstar Health", status: "Review", org: "Healthcare", lead: "Sofia" },
];

const didStages = [
  "Generate DID",
  "Publish DID document",
  "Rotate keys",
  "Verify revocation status",
];

const authProviders = ["Microsoft Entra ID", "Google Workspace", "GitHub", "Custom SSO"];

export default function PlatformPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 sm:text-sm">Platform</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Multi-issuer operations dashboard</h1>
        </div>
        <Link href="/admin" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 sm:w-auto">
          Open issuer admin <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${metric.tone}`}>
              {metric.label}
            </div>
            <div className="mt-4 text-3xl font-bold text-slate-900">{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Issuer workspace queue</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">Operational readiness</h2>
            </div>
            <Building2 className="h-5 w-5 text-cyan-700" />
          </div>

          <div className="space-y-3">
            {issuerQueue.map((issuer) => (
              <div key={issuer.name} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{issuer.name}</div>
                  <div className="text-sm text-slate-600">{issuer.org} • Lead: {issuer.lead}</div>
                </div>
                <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-700">
                  {issuer.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Trust layer</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">Security posture</h2>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
          </div>

          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <BadgeCheck className="h-4 w-4" />
                <span className="text-sm font-semibold">Server-side signing enabled</span>
              </div>
            </div>
            <div className="rounded-xl bg-cyan-50 p-4">
              <div className="flex items-center gap-2 text-cyan-700">
                <KeyRound className="h-4 w-4" />
                <span className="text-sm font-semibold">DID key rotation supported</span>
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-amber-700">
                <FileCheck2 className="h-4 w-4" />
                <span className="text-sm font-semibold">Revocation checkpoint active</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">DID lifecycle</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">Operational flow</h2>
            </div>
            <Sparkles className="h-5 w-5 text-violet-700" />
          </div>

          <div className="space-y-3">
            {didStages.map((stage, index) => (
              <div key={stage} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {index + 1}
                </div>
                <div className="text-sm font-medium text-slate-700">{stage}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Enterprise auth</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">SSO and access</h2>
            </div>
            <ShieldCheck className="h-5 w-5 text-cyan-700" />
          </div>

          <div className="flex flex-wrap gap-2">
            {authProviders.map((provider) => (
              <span key={provider} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700">
                {provider}
              </span>
            ))}
          </div>

          <div className="mt-5 rounded-xl bg-slate-900 p-4 text-slate-100">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">SaaS readiness</div>
            <div className="mt-2 text-xl font-semibold">Starter, Professional, and Enterprise tiers</div>
            <Link href="/enterprise" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-cyan-300">
              Review plan tiers <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
