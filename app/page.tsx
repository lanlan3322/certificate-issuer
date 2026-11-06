import Link from "next/link";
import { ConversionCTA, MarketingCards } from "../components/MarketingPage";
import { capabilities, publicMetadata, solutions } from "../lib/marketing";

export const metadata = publicMetadata("/", "Trusted Digital Credentials. Instant Verification.", "Verifiable.sg is a Credential-as-a-Service platform that enables organizations to issue, manage, revoke and verify trusted digital credentials under their own identity and brand.");

export default function HomePage() {
  return <main>
    <section className="theme-fixed bg-slate-950 text-white">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:px-8 lg:py-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">Credential-as-a-Service · Digital Trust Infrastructure</p>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">Trusted Digital Credentials. Instant Verification.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Verifiable.sg is a Credential-as-a-Service platform that enables organizations to issue, manage, revoke and verify trusted digital credentials under their own identity and brand.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact#demo" className="inline-flex min-h-11 items-center rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200">Book Demo</Link>
            <Link href="/contact#consultation" className="inline-flex min-h-11 items-center rounded-xl border border-slate-500 px-5 py-3 font-semibold text-white hover:bg-slate-800">Start Free Consultation</Link>
          </div>
          <Link href="/verify" className="mt-6 inline-flex min-h-11 items-center text-sm text-cyan-200 underline underline-offset-4 hover:text-white">Already have a credential? Verify it here</Link>
        </div>
        <aside aria-labelledby="trust-heading" className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Your identity, connected</p>
          <h2 id="trust-heading" className="mt-3 text-2xl font-semibold text-white">One governed credential ecosystem</h2>
          <ol className="mt-6 space-y-4">
            {[
              ["Organization", "Your domain, brand and access policies"],
              ["Issuer", "Authorized teams with individual signing keys"],
              ["Credential", "Signed achievements with lifecycle evidence"],
              ["Verification", "Public checks for recipients and relying parties"],
            ].map(([title, text], index) => <li key={title} className="flex gap-4">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-200">{index + 1}</span>
              <div><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-300">{text}</p></div>
            </li>)}
          </ol>
        </aside>
      </div>
    </section>
    <div className="mx-auto max-w-7xl space-y-16 px-4 py-12 sm:px-6 lg:px-8">
      <section aria-labelledby="standards-heading">
        <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">Trust through evidence, not logos</p>
        <h2 id="standards-heading" className="mt-2 text-2xl font-bold">Built on open credential standards</h2>
        <p className="mt-4 max-w-3xl leading-7 text-slate-600 dark:text-slate-300">W3C Verifiable Credentials, DID-based identity and supported OpenCerts, TrustVC and TradeTrust workflows. Verification depends on credential format and available trust evidence.</p>
      </section>
      <section aria-labelledby="challenges-heading">
        <h2 id="challenges-heading" className="mb-6 text-3xl font-bold">Beyond generating a certificate</h2>
        <div className="grid gap-4 md:grid-cols-3">{[
          ["Replace manual checks", "Give recipients and employers a direct path to check credential evidence."],
          ["Keep your identity", "Connect credentials to your organization and the authorized issuer behind them."],
          ["Manage what happens next", "Review records, share credentials, revoke when needed and audit recorded activity."],
        ].map(([title, text]) => <article key={title} className="card"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-7">{text}</p></article>)}</div>
      </section>
      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-3xl font-bold">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">{[
          ["Establish your organization", "Configure your team, issuers and identity."],
          ["Issue under your brand", "Choose a template; its issuer and key are selected automatically."],
          ["Keep trust accessible", "Share signed credentials and manage their status after issuance."],
        ].map(([title, text], index) => <li key={title} className="card"><p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">0{index + 1}</p><h3 className="mt-3 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-7">{text}</p></li>)}</ol>
      </section>
      <section aria-labelledby="lifecycle-heading">
        <h2 id="lifecycle-heading" className="text-3xl font-bold">The complete credential lifecycle</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-5">{["Issue", "Manage", "Verify", "Revoke", "Audit"].map((stage, index) => <li key={stage} className="rounded-xl border border-cyan-200 bg-cyan-50 p-5 dark:border-cyan-900 dark:bg-cyan-950"><span className="text-xs text-cyan-800 dark:text-cyan-200">{index + 1}</span><p className="mt-2 font-semibold">{stage}</p></li>)}</ol>
      </section>
      <section aria-labelledby="capabilities-heading"><h2 id="capabilities-heading" className="mb-6 text-3xl font-bold">Infrastructure for enterprise credentials</h2><MarketingCards base="/platform" entries={capabilities} /></section>
      <section aria-labelledby="industries-heading"><h2 id="industries-heading" className="mb-6 text-3xl font-bold">Built for your credential community</h2><MarketingCards base="/solutions" entries={solutions} /></section>
      <section aria-labelledby="pricing-heading">
        <h2 id="pricing-heading" className="text-3xl font-bold">Grow your credential programme</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">{[
          ["Starter", "SGD 49/month", "Establish your programme: 1 issuer, 5 templates, 100 credentials/month."],
          ["Professional", "SGD 299/month", "Coordinate growing teams: 5 issuers, 10 templates, 1,000 credentials/month."],
          ["Enterprise", "From SGD 899/month", "Scale your ecosystem: unlimited issuers, templates and credentials."],
        ].map(([title, price, text]) => <article key={title} className="card"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 text-2xl font-semibold">{price}</p><p className="mt-3 text-sm leading-7">{text}</p></article>)}</div>
        <Link href="/pricing" className="btn-secondary mt-6">Compare plans & commercial terms</Link>
      </section>
      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-3xl font-bold">Common questions</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="card"><h3 className="text-lg font-semibold">Can we use our own identity?</h3><p className="mt-3 text-sm leading-7">Choose managed organization identity or deploy a self-managed did:web on your domain. Each issuer retains its own signing key.</p></article>
          <article className="card"><h3 className="text-lg font-semibold">Do verifiers need an account?</h3><p className="mt-3 text-sm leading-7">No. The public verification service checks supported credential evidence without workspace access.</p></article>
        </div>
        <Link href="/resources/faqs" className="btn-secondary mt-6">Explore FAQs & resources</Link>
      </section>
      <ConversionCTA />
    </div>
  </main>;
}
