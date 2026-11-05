import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { getPlatformStats } from "@/lib/platform";
import { getCurrentIssuerUser } from "@/lib/auth";

export default async function PlatformPage() {
  const stats = await getPlatformStats();
  const user = await getCurrentIssuerUser();
  const hasIssuerAdminRole = user?.roles.includes("issuer-admin") ?? false;

  const didStages = [
    "Generate DID",
    "Publish DID document",
    "Rotate keys",
    "Verify revocation status",
  ];

  const metrics = [
    {
      label: "Active Issuers",
      value: String(stats.activeIssuers),
      tone: "bg-slate-900 text-white",
    },
    {
      label: "Issued Credentials",
      value: stats.totalCredentials >= 1000
        ? `${(stats.totalCredentials / 1000).toFixed(1)}k`
        : String(stats.totalCredentials),
      tone: "bg-cyan-100 text-cyan-800",
    },
    {
      label: "Organizations",
      value: String(stats.totalOrganizations),
      tone: "bg-emerald-100 text-emerald-800",
    },
    {
      label: "Users on Platform",
      value: String(stats.totalUsers),
      tone: "bg-amber-100 text-amber-800",
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 sm:text-sm">Credential-as-a-Service</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Organization operations</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Manage organizations and issuer access for branded credential programmes.</p>
        </div>
        {hasIssuerAdminRole && (
          <Link href="/admin" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 sm:w-auto">
            Open issuer admin <ArrowRight className="h-4 w-4" />
          </Link>
        )}
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

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">DID lifecycle</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">Issuer identity lifecycle</h2>
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
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Enterprise sign-on</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">SSO and access</h2>
            </div>
            <ShieldCheck className="h-5 w-5 text-cyan-700" />
          </div>

          <p className="text-sm leading-6 text-slate-600">Enterprise single sign-on integrations are not available in this workspace.</p>

          <div className="mt-5 rounded-xl bg-slate-900 p-4 text-slate-100">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">CaaS plans</div>
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
