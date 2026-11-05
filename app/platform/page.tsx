import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPlatformStats } from "@/lib/platform";
import { getCurrentIssuerUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export default async function PlatformPage() {
  const user = await getCurrentIssuerUser();
  if (!hasPermission(user, "organizations.manage")) return <main className="p-6"><h1 className="text-2xl font-bold">Platform overview</h1><p role="alert" className="mt-3">Platform administrator access is required.</p></main>;
  const stats = await getPlatformStats();
  const metrics = [
    ["Active issuers", stats.activeIssuers], ["Issued credentials", stats.totalCredentials],
    ["Active organizations", stats.totalOrganizations], ["Platform users", stats.totalUsers],
  ] as const;
  const actions = [
    ["/organizations", "Organizations & members", "Create organizations, manage memberships and review access."],
    ["/admin", "Issuer accounts", "Invite issuer users and manage account status."],
    ["/dashboard", "Credential oversight", "Review issued credentials across organizations."],
    ["/templates/builder", "Template management", "Maintain credential designs and organization ownership."],
    ["/audit", "Activity & audit", "Review recorded administrative and credential activity."],
    ["/did", "Issuer identity", "Review the existing DID:web identity configuration."],
  ];
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Platform administration</p>
      <h1 className="mt-2 text-3xl font-bold">Platform overview</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">A single entry point for organization, issuer and credential operations.</p>
    </header>
    <section aria-label="Platform summary" className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metrics.map(([label, value]) => <div key={label} className="stat-card"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p></div>)}
    </section>
    <section aria-labelledby="operations-heading">
      <h2 id="operations-heading" className="mb-4 text-xl font-semibold">Operations</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {actions.map(([href, title, description]) => <Link key={href} href={href} prefetch={false} className="card transition-colors hover:border-cyan-500">
          <h3 className="flex items-center justify-between gap-3 font-semibold">{title}<ArrowRight size={18} aria-hidden="true" className="shrink-0 text-cyan-700" /></h3>
          <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
        </Link>)}
      </div>
    </section>
  </main>;
}
