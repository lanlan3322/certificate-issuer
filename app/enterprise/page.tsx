import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check, CreditCard, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Enterprise Pricing | Verifiable.sg",
  description: "Affordable digital credential infrastructure for organizations of all sizes. Issue, verify and manage trusted credentials with managed or self-managed digital identities.",
};

const plans = [
  {
    name: "Starter",
    price: "SGD 49",
    billing: "/ Month",
    description: "Perfect for trainers, coaches, consultants and small training providers.",
    features: ["1 Issuer", "3 Certificate Templates", "100 Certificates Per Month", "Managed DID", "Certificate Verification Portal", "Certificate Revocation", "Basic Reporting", "Standard Support"],
    note: "Certificate allowance resets each month.",
    idealFor: ["Training providers", "Coaches", "Professional trainers", "Small academies", "Membership organizations"],
    cta: "Start Free Consultation",
    featured: false,
  },
  {
    name: "Professional",
    price: "SGD 199",
    billing: "/ Month",
    description: "Designed for schools, academies, certification bodies and growing organizations.",
    features: ["Unlimited Issuers", "Unlimited Certificate Templates", "1,000 Certificates Per Month", "Annual Certificate Credit Carry Forward", "Managed DID", "Organization Branding", "Certificate Verification Portal", "Certificate Revocation", "Advanced Reporting", "Priority Support"],
    note: "Unused certificate credits accumulate throughout the subscription year. Certificate balance resets upon annual renewal.",
    idealFor: ["Private schools", "Training academies", "Certification providers", "Professional associations", "Corporate learning departments"],
    cta: "Book a Demo",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "From SGD 499",
    billing: "/ Month",
    description: "For universities, enterprises, regulators and large-scale credential programmes.",
    features: ["Unlimited Issuers", "Unlimited Templates", "Unlimited Certificates", "Dedicated Organization Portal", "Self-Managed DID", "Multi-Issuer DID Management", "DID Document Generator", "Verification Key Management", "Custom Branding", "API Access", "Bulk Issuance", "Priority Support", "Dedicated Onboarding"],
    note: "",
    idealFor: ["Universities", "Regulatory bodies", "Enterprises", "Government projects", "Professional licensing authorities"],
    cta: "Contact Sales",
    featured: false,
  },
];

const benefits = [
  "Tamper-Proof Digital Credentials", "Instant Online Verification", "Certificate Revocation & Lifecycle Management",
  "Organization Branding", "Multi-Issuer Support", "Managed or Self-Managed DID", "No Technical Knowledge Required",
  "Secure Cloud Platform", "Open Standards Compatible",
];

const comparison = [
  ["Issuers", "1 Issuer", "Unlimited Issuers", "Unlimited Issuers"],
  ["Templates", "3 Templates", "Unlimited Templates", "Unlimited Templates"],
  ["Certificates", "100 Certificates/Month", "1,000 Certificates/Month", "Unlimited Certificates"],
  ["Credit Carry Forward", "Monthly reset", "Monthly Credit Carry Forward", "Unlimited Certificates"],
  ["Digital Identity", "Managed DID", "Managed DID", "Self-Managed DID"],
  ["Reporting", "Basic Reporting", "Advanced Reporting", "Contact Sales"],
  ["DID Management", "Managed DID", "Managed DID", "Multi-Issuer DID Management"],
  ["API Access", "Contact us", "Contact us", "API Access"],
  ["Support", "Standard Support", "Priority Support", "Dedicated Support"],
  ["Price", "SGD 49/month", "SGD 199/month", "From SGD 499/month"],
];

export default function EnterprisePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 sm:text-sm">Simple, Transparent Pricing for Digital Credential Management</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Enterprise Plans</h1>
        <p className="mt-3 text-sm text-slate-600">Issue, verify and manage trusted digital credentials with your own organization branding. Start small and scale as your credentialing needs grow.</p>
        <p className="mt-3 text-sm text-slate-600">All prices are in Singapore dollars (SGD).</p>
      </div>

      <section aria-labelledby="plans-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-violet-700" aria-hidden="true" />
          <h2 id="plans-heading" className="text-xl font-semibold text-slate-900">Available plans</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.name} className={`rounded-2xl border p-5 ${plan.featured ? "border-slate-900 bg-slate-900 text-white shadow-lg" : "border-slate-200 bg-slate-50 text-slate-900"}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                {plan.featured && (
                  <span className="rounded-full bg-cyan-400 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-900">★ Most Popular</span>
                )}
              </div>
              <div className="mt-4 text-3xl font-bold">{plan.price}</div>
              <p className="mt-1 text-sm">{plan.billing}</p>
              <p className="mt-4 text-sm leading-6">{plan.description}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${plan.featured ? "text-cyan-300" : "text-emerald-600"}`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {plan.note && <p className="mt-4 text-sm leading-6">{plan.note}</p>}
              {plan.name === "Starter" && <div className="mt-4 text-sm">
                <h4 className="font-semibold">Optional Add-ons</h4>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Additional template: SGD29</li>
                  <li>Additional certificate: SGD0.99</li>
                  <li>Self-Managed DID: SGD299</li>
                </ol>
              </div>}
              {plan.idealFor.length > 0 && <div className="mt-4 text-sm">
                <h4 className="font-semibold">Ideal For</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5">{plan.idealFor.map((audience) => <li key={audience}>{audience}</li>)}</ul>
              </div>}
              <Link href="/contact" className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${plan.featured ? "bg-cyan-400 text-slate-900 hover:bg-cyan-300" : "bg-slate-900 text-white hover:bg-slate-700"}`}>
                {plan.cta} <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="comparison-heading" className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 id="comparison-heading" className="text-xl font-semibold text-slate-900">Plans Comparison</h2>
        <div className="mt-5 overflow-x-auto" role="region" aria-label="Plans comparison table" tabIndex={0}>
          <table className="w-full min-w-[640px] text-left text-sm text-slate-900">
            <caption className="sr-only">Compare allowances, identity options and pricing across all plans</caption>
            <thead><tr>{["Feature", ...plans.map((plan) => `${plan.name}${plan.featured ? " ★ Most Popular" : ""}`)].map((heading) => <th key={heading} scope="col" className="border-b border-slate-200 p-3 font-semibold">{heading}</th>)}</tr></thead>
            <tbody>{comparison.map(([label, ...values]) => <tr key={label}>
              <th scope="row" className="border-b border-slate-200 p-3 font-medium">{label}</th>
              {values.map((value, index) => <td key={index} className="border-b border-slate-200 p-3">{value}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="why-heading" className="mt-8 rounded-2xl border border-slate-200 bg-gradient-to-r from-cyan-50 to-slate-50 p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-cyan-700" aria-hidden="true" />
          <h2 id="why-heading" className="text-xl font-semibold text-slate-900">Why Verifiable.sg</h2>
        </div>
        <ul className="mt-4 space-y-3 text-sm text-slate-900">{benefits.map((benefit) => <li key={benefit} className="flex items-start gap-2">
          <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{benefit}</span>
        </li>)}</ul>
      </section>

      <section aria-labelledby="custom-heading" className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 id="custom-heading" className="text-xl font-semibold text-slate-900">Need a Custom Solution?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">For high-volume issuance, white-label deployments, API integrations, organization onboarding, or custom workflows, contact our team for a tailored enterprise proposal.</p>
        <a href="mailto:support@verifiable.sg" className="mt-4 inline-block text-sm font-semibold text-cyan-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2">support@verifiable.sg</a>
      </section>
      <p className="mt-8 text-center text-sm text-slate-600">All plans include certificate verification, revocation support, and secure digital credential hosting.</p>
    </main>
  );
}
