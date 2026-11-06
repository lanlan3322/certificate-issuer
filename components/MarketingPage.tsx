import Link from "next/link";
import type { MarketingEntry } from "../lib/marketing";

export function ConversionCTA() {
  return <section aria-labelledby="consultation-heading" className="theme-fixed rounded-2xl bg-slate-950 p-6 text-white sm:p-10">
    <h2 id="consultation-heading" className="text-2xl font-bold text-white">Build your credential ecosystem</h2>
    <p className="mt-3 max-w-2xl text-slate-300">Discuss your organization, issuer governance and verification needs with the Verifiable.sg team.</p>
    <div className="mt-6 flex flex-wrap gap-3">
      <Link href="/contact#demo" className="inline-flex min-h-11 items-center rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200">Book Demo</Link>
      <Link href="/contact#consultation" className="inline-flex min-h-11 items-center rounded-xl border border-slate-500 px-5 py-3 font-semibold text-white hover:bg-slate-800">Start Free Consultation</Link>
    </div>
  </section>;
}

export function MarketingCards({ base, entries }: { base: string; entries: readonly { slug: string; title: string; description: string }[] }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {entries.map(entry => <Link key={entry.slug} href={`${base}/${entry.slug}`} className="card block transition-colors hover:border-cyan-600">
      <h3 className="text-lg font-semibold">{entry.title}<span aria-hidden="true" className="ml-2 text-cyan-700 dark:text-cyan-300">→</span></h3>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{entry.description}</p>
    </Link>)}
  </div>;
}

export function MarketingIndex({ title, description, base, entries }: { title: string; description: string; base: string; entries: readonly { slug: string; title: string; description: string }[] }) {
  return <main className="mx-auto max-w-7xl space-y-12 px-4 py-12 sm:px-6 lg:px-8">
    <header className="max-w-3xl"><p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">Credential-as-a-Service</p>
      <h1 className="mt-3 text-4xl font-bold">{title}</h1><p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">{description}</p>
    </header>
    <section aria-label={title}><h2 className="sr-only">Explore {title}</h2><MarketingCards base={base} entries={entries} /></section>
    <ConversionCTA />
  </main>;
}

export function MarketingDetail({ entry, base, category }: { entry: MarketingEntry; base: string; category: string }) {
  return <main className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
    <nav aria-label="Breadcrumb"><Link className="text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300" href={base}>{category}</Link></nav>
    <header className="max-w-3xl"><h1 className="text-4xl font-bold">{entry.title}</h1>
      <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">{entry.description}</p></header>
    <section className="card"><h2 className="text-xl font-semibold">The challenge</h2><p className="mt-3 leading-7">{entry.challenge}</p></section>
    <div className="grid gap-6 md:grid-cols-2">
      <section className="card"><h2 className="text-xl font-semibold">What your organization gains</h2>
        <ul className="mt-4 list-disc space-y-3 pl-5">{entry.benefits.map(item => <li key={item}>{item}</li>)}</ul></section>
      <section className="card"><h2 className="text-xl font-semibold">Use cases</h2>
        <ul className="mt-4 list-disc space-y-3 pl-5">{entry.useCases.map(item => <li key={item}>{item}</li>)}</ul></section>
    </div>
    <section><h2 className="text-2xl font-semibold">The outcome</h2><p className="mt-3 max-w-3xl leading-7">{entry.outcome}</p></section>
    <ConversionCTA />
  </main>;
}
