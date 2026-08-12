import { ArrowRight, Check, CreditCard, Lock, Sparkles } from "lucide-react";

const providers = [
  { name: "Microsoft Entra ID", status: "Recommended" },
  { name: "Google Workspace", status: "Ready" },
  { name: "GitHub", status: "Preview" },
  { name: "OIDC / SAML", status: "Custom" },
];

const plans = [
  { name: "Starter", price: "$49", features: ["1 issuer", "3 templates", "Basic verification"], featured: false },
  { name: "Professional", price: "$199", features: ["Unlimited issuers", "Bulk issuance", "Audit dashboard"], featured: true },
  { name: "Enterprise", price: "Custom", features: ["SSO + SCIM", "Private deployment", "SLAs"], featured: false },
];

export default function EnterprisePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">Enterprise access</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">Authentication and subscription management</h1>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Lock className="h-5 w-5 text-cyan-700" />
          <h2 className="text-xl font-semibold text-slate-900">SSO providers</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {providers.map((provider) => (
            <div key={provider.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-base font-semibold text-slate-900">{provider.name}</div>
              <div className="mt-2 inline-flex rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-800">{provider.status}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-violet-700" />
          <h2 className="text-xl font-semibold text-slate-900">Subscription plans</h2>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.name} className={`rounded-2xl border p-5 ${plan.featured ? "border-slate-900 bg-slate-900 text-white shadow-lg" : "border-slate-200 bg-slate-50 text-slate-900"}`}>
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{plan.name}</div>
                {plan.featured && (
                  <span className="rounded-full bg-cyan-400 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-900">Popular</span>
                )}
              </div>
              <div className="mt-4 text-3xl font-bold">{plan.price}</div>
              <div className="mt-4 space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <Check className={`h-4 w-4 ${plan.featured ? "text-cyan-300" : "text-emerald-600"}`} />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <button className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${plan.featured ? "bg-cyan-400 text-slate-900 hover:bg-cyan-300" : "bg-slate-900 text-white hover:bg-slate-700"}`}>
                Choose plan <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-gradient-to-r from-cyan-50 to-slate-50 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-cyan-700" />
          <h2 className="text-xl font-semibold text-slate-900">Commercial SaaS readiness</h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          This platform scaffolding supports the commercial roadmap with plans, enterprise authentication, and a clear issuer-to-tenant operating model for scaling beyond the initial proof of concept.
        </p>
      </div>
    </main>
  );
}
