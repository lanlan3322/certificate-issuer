import Link from "next/link";
import type { ReactNode } from "react";

interface Section {
  id: string;
  title: string;
  content: ReactNode;
}

export default function LegalPage({ title, introduction, sections }: {
  title: string;
  introduction: string;
  sections: Section[];
}) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 text-slate-800 dark:text-slate-200 sm:px-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">Verifiable.sg</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">{title}</h1>
        <p className="mt-4 leading-7 text-slate-600 dark:text-slate-300">{introduction}</p>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Last updated: 28 October 2026</p>
      </header>
      <nav aria-label={`${title} sections`} className="my-8 rounded-xl border border-slate-200 p-5 dark:border-slate-700">
        <h2 className="font-semibold">On this page</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {sections.map((section) => <li key={section.id}><a href={`#${section.id}`} className="text-cyan-800 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 dark:text-cyan-300">{section.title}</a></li>)}
        </ul>
      </nav>
      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
            <h2 id={`${section.id}-heading`} className="text-xl font-bold">{section.title}</h2>
            <div className="mt-4 space-y-3 text-sm leading-7 [&_a]:text-cyan-800 [&_a]:underline [&_a]:underline-offset-4 [&_a]:focus-visible:outline [&_a]:focus-visible:outline-2 [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 dark:[&_a]:text-cyan-300">{section.content}</div>
          </section>
        ))}
      </div>
      <nav aria-label="Related legal pages" className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/privacy" className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Privacy Policy</Link>
        <Link href="/terms" className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Terms of Service</Link>
        <Link href="/contact" className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Contact Us</Link>
      </nav>
    </main>
  );
}
